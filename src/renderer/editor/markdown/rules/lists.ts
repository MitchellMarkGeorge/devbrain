import type { JSONContent } from '@tiptap/core';
import { markupOf, withMarkup } from '../markup';
import type {
  MarkdownRule,
  MarkdownToken,
  ParseHelpers,
  RenderContext,
  RenderHelpers,
  TokenizerHelpers,
} from '../types';

/**
 * Bullet, numbered and to-do lists, read and written as TipTap's list extensions did: `marked`
 * reads bullet lists; numbered lists and to-do lists have tokenizers of their own, which read
 * `a.`, `i.` and `A)` numbering and nest items by their indent.
 *
 * A list keeps the marker it was written with when it isn't the editor's, in its `markup`
 * attribute (markup.ts): `*` or `+` for a bullet or to-do list, `)` for a numbered one, and `X`
 * on a to-do item checked with a capital. An item is written with its list's marker, so one added
 * to a list takes it.
 */

// ---- writing an item: its first paragraph after the marker, the rest indented under it

const TAB_STOP = 4;

// the width of indentation in columns, a tab running to the next tab stop
function columnWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width = character === '\t' ? width + TAB_STOP - (width % TAB_STOP) : width + 1;
  }
  return width;
}

function renderNestedContent(
  node: JSONContent,
  h: RenderHelpers,
  prefix: string,
  options: { alignNestedToPrefix?: boolean; indentMainContent?: boolean } = {},
): string {
  if (!node || !Array.isArray(node.content)) return '';
  const [content, ...children] = node.content;
  const mainContent = h.renderChildren([content]);
  let output = `${prefix}${
    options.indentMainContent
      ? mainContent
          .split('\n')
          .map((line, index) => (index === 0 ? line : h.indent(line)))
          .join('\n')
      : mainContent
  }`;
  children.forEach((child, index) => {
    const childContent = h.renderChild(child, index + 1);
    if (childContent === undefined || childContent === null) return;
    const indentLine = (line: string) => {
      if (!options.alignNestedToPrefix) return h.indent(line);
      const configured = h.indent('');
      const prefixWidth = columnWidth(prefix);
      return (columnWidth(configured) >= prefixWidth ? configured : ' '.repeat(prefixWidth)) + line;
    };
    // blank lines are indented too
    const indented = childContent
      .split('\n')
      .map((line) => indentLine(line))
      .join('\n');
    output += child.type === 'paragraph' ? `\n\n${indented}` : `\n${indented}`;
  });
  return output;
}

// ---- numbering: 1., a., A., i., I.

const ROMAN_NUMERALS: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];
const ALPHA_NUMERALS = 'abcdefghijklmnopqrstuvwxyz';

// a numbered item's marker: digits, a roman numeral, or one or two letters
const ORDERED_LIST_MARKER_PATTERN = String.raw`\d+|[ivxlcdmIVXLCDM]+|[a-zA-Z]{1,2}`;

function toRoman(num: number): string {
  let remaining = num;
  let result = '';
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

function fromRoman(roman: string): number {
  const lower = roman.toLowerCase();
  let index = 0;
  let result = 0;
  while (index < lower.length) {
    const found = ROMAN_NUMERALS.find(([, numeral]) => lower.startsWith(numeral, index));
    if (!found) return 0;
    result += found[0];
    index += found[1].length;
  }
  return result;
}

function isValidRoman(marker: string): boolean {
  if (!/^[ivxlcdmIVXLCDM]+$/.test(marker)) return false;
  const value = fromRoman(marker);
  if (value <= 0) return false;
  return (
    (marker === marker.toLowerCase() ? toRoman(value) : toRoman(value).toUpperCase()) === marker
  );
}

function fromAlpha(marker: string): number {
  const lower = marker.toLowerCase();
  if (lower.length === 1) return lower.charCodeAt(0) - 97 + 1;
  if (lower.length === 2) {
    return (lower.charCodeAt(0) - 97 + 1) * 26 + (lower.charCodeAt(1) - 97) + 1;
  }
  return 0;
}

function toAlpha(num: number): string {
  if (num <= 26) return ALPHA_NUMERALS[num - 1];
  const first = Math.floor((num - 1) / 26) - 1;
  const second = (num - 1) % 26;
  if (first < 0) return ALPHA_NUMERALS[second];
  return ALPHA_NUMERALS[first] + ALPHA_NUMERALS[second];
}

// the list's `type` attribute for a marker: undefined for digits
function detectMarkerType(marker: string): string | undefined {
  if (!marker || /^\d+$/.test(marker)) return undefined;
  if (isValidRoman(marker)) return marker === marker.toLowerCase() ? 'i' : 'I';
  if (/^[a-z]{1,2}$/.test(marker)) return 'a';
  if (/^[A-Z]{1,2}$/.test(marker)) return 'A';
  return undefined;
}

function markerToStart(marker: string): number {
  if (/^\d+$/.test(marker)) return parseInt(marker, 10);
  const type = detectMarkerType(marker);
  if (type === 'i' || type === 'I') return fromRoman(marker);
  if (type === 'a' || type === 'A') {
    const start = fromAlpha(marker);
    return start > 0 ? start : 1;
  }
  const parsed = parseInt(marker, 10);
  return Number.isNaN(parsed) ? 1 : parsed;
}

function listMarker(type: unknown, index: number, separator = '. '): string {
  const position = index + 1;
  switch (type) {
    case 'a':
      return `${toAlpha(position)}${separator}`;
    case 'A':
      return `${toAlpha(position).toUpperCase()}${separator}`;
    case 'i':
      return `${toRoman(position)}${separator}`;
    case 'I':
      return `${toRoman(position).toUpperCase()}${separator}`;
    default:
      return `${position}${separator}`;
  }
}

// ---- reading numbered lists

// a numbered item's line: (1) indent, (2) marker, (3) `.` or `)`, (4) its text
const ORDERED_LIST_ITEM = new RegExp(`^(\\s*)(${ORDERED_LIST_MARKER_PATTERN})([.)])\\s+(.*)$`);

/**
 * Whether `marker` numbers a list item: digits, a roman numeral, or one or two letters of one
 * case. Anything else before a `.` is a word that ends a sentence: "No. I think so" is a
 * paragraph, not an item numbered "No".
 */
export function isListNumber(marker: string): boolean {
  return /^\d+$/.test(marker) || detectMarkerType(marker) !== undefined;
}

// a line as a numbered item: its indent, number, delimiter and text; null when it isn't one
function orderedItemOf(line: string): RegExpMatchArray | null {
  const match = line.match(ORDERED_LIST_ITEM);
  return match && isListNumber(match[2]) ? match : null;
}
const INDENTED_LINE = /^\s/;

// blocks that can interrupt a paragraph, so a line starting with one is never lazy continuation
const PARAGRAPH_INTERRUPTERS = {
  heading: /^#{1,6}(?:\s|$)/,
  bulletItem: /^[-+*]\s+/,
  codeFence: /^(?:```|~~~)/,
  blockMath: /^\$\$/,
  thematicBreak: /^(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/,
};

function isBlockContentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    PARAGRAPH_INTERRUPTERS.bulletItem.test(trimmed) ||
    orderedItemOf(trimmed.trimStart()) !== null ||
    PARAGRAPH_INTERRUPTERS.heading.test(trimmed) ||
    (PARAGRAPH_INTERRUPTERS.thematicBreak.test(trimmed) && !trimmed.startsWith('-')) ||
    /^>\s?/.test(trimmed) ||
    PARAGRAPH_INTERRUPTERS.codeFence.test(trimmed) ||
    PARAGRAPH_INTERRUPTERS.blockMath.test(trimmed)
  );
}

function interruptsLazyContinuation(line: string): boolean {
  return Object.values(PARAGRAPH_INTERRUPTERS).some((pattern) => pattern.test(line));
}

// an item's first paragraph, and the blocks after it
function splitItemContent(contentLines: string[]) {
  const paragraphLines: string[] = [];
  const blockLines: string[] = [];
  let reachedBlock = false;
  for (const line of contentLines) {
    if (reachedBlock) {
      blockLines.push(line);
    } else if (line.trim() === '') {
      reachedBlock = true;
      blockLines.push(line);
    } else if (paragraphLines.length > 0 && isBlockContentLine(line)) {
      reachedBlock = true;
      blockLines.push(line);
    } else {
      paragraphLines.push(line);
    }
  }
  return { paragraphLines, blockLines };
}

interface OrderedItem {
  indent: number;
  number: number;
  type: string | undefined;
  content: string;
  contentLines: string[];
  raw: string;
  // `.` or `)` after the number
  delimiter: string;
}

// the numbered items at the start of `lines`, flat, and how many lines they took
function collectOrderedListItems(lines: string[]): [OrderedItem[], number] {
  const items: OrderedItem[] = [];
  let index = 0;
  let consumed = 0;
  while (index < lines.length) {
    const line = lines[index];
    const match = orderedItemOf(line);
    if (!match) break;
    const [, indent, marker, delimiter, content] = match;
    const indentLevel = indent.length;
    const number = parseInt(marker, 10);
    const markerType = Number.isNaN(number) ? detectMarkerType(marker) : undefined;
    const itemNumber = Number.isNaN(number) ? markerToStart(marker) : number;
    const contentLines = [content];
    const itemLines = [line];
    let next = index + 1;
    let sawBlankLine = false;
    while (next < lines.length) {
      const nextLine = lines[next];
      if (orderedItemOf(nextLine)) break;
      if (nextLine.trim() === '') {
        itemLines.push(nextLine);
        contentLines.push('');
        sawBlankLine = true;
        next += 1;
      } else if (nextLine.match(INDENTED_LINE)) {
        const leadingWhitespace = nextLine.length - nextLine.trimStart().length;
        // the column the item's text starts at, after its number, delimiter and spaces
        const contentIndent = line.length - content.length;
        itemLines.push(nextLine);
        contentLines.push(nextLine.slice(Math.min(leadingWhitespace, contentIndent)));
        next += 1;
      } else {
        if (sawBlankLine || interruptsLazyContinuation(nextLine)) break;
        itemLines.push(nextLine);
        contentLines.push(nextLine);
        next += 1;
      }
    }
    items.push({
      indent: indentLevel,
      number: itemNumber,
      type: markerType,
      content: contentLines.join('\n').trim(),
      contentLines,
      raw: itemLines.join('\n'),
      delimiter,
    });
    consumed = next;
    index = next;
  }
  return [items, consumed];
}

const ORDERED_LIST_SCAN_WINDOW = 64;

function takeLines(source: string, max: number): string[] {
  const lines: string[] = [];
  let start = 0;
  while (lines.length < max) {
    const lineEnd = source.indexOf('\n', start);
    if (lineEnd === -1) {
      lines.push(source.slice(start));
      return lines;
    }
    lines.push(source.slice(start, lineEnd));
    start = lineEnd + 1;
  }
  return lines;
}

// the numbered items at the start of `source`, reading only as many lines as the list needs
function collectOrderedListItemsFromSource(source: string): [OrderedItem[], number, string[]] {
  const firstLineEnd = source.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? source : source.slice(0, firstLineEnd);
  if (!orderedItemOf(firstLine)) return [[], 0, []];
  let windowSize = ORDERED_LIST_SCAN_WINDOW;
  let lines = takeLines(source, windowSize);
  let collected = collectOrderedListItems(lines);
  while (collected[1] === lines.length && lines.length === windowSize) {
    windowSize *= 2;
    lines = takeLines(source, windowSize);
    collected = collectOrderedListItems(lines);
  }
  return [collected[0], collected[1], lines];
}

// the flat items as list_item tokens, each holding the items indented under it as a list
function buildNestedStructure(
  items: OrderedItem[],
  baseIndent: number,
  lexer: TokenizerHelpers,
): MarkdownToken[] {
  const result: MarkdownToken[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    if (item.indent !== baseIndent) {
      index += 1;
      continue;
    }
    const { paragraphLines, blockLines } = splitItemContent(item.contentLines);
    const mainText = paragraphLines.join('\n').trim();
    const tokens: MarkdownToken[] = [];
    if (mainText) {
      tokens.push({ type: 'paragraph', raw: mainText, tokens: lexer.inlineTokens(mainText) });
    }
    const additional = blockLines.join('\n').trim();
    if (additional) tokens.push(...lexer.blockTokens(additional));
    let lookAhead = index + 1;
    const nested: OrderedItem[] = [];
    while (lookAhead < items.length && items[lookAhead].indent > baseIndent) {
      nested.push(items[lookAhead]);
      lookAhead += 1;
    }
    if (nested.length > 0) {
      tokens.push({
        type: 'list',
        ordered: true,
        start: nested[0].number,
        typeMarker: nested[0].type,
        delimiter: nested[0].delimiter,
        items: buildNestedStructure(nested, Math.min(...nested.map((n) => n.indent)), lexer),
        raw: nested.map((n) => n.raw).join('\n'),
      });
    }
    result.push({ type: 'list_item', raw: item.raw, tokens });
    index = lookAhead;
  }
  return result;
}

function parseOrderedListItems(items: MarkdownToken[], helpers: ParseHelpers): JSONContent[] {
  return items.map((item) => {
    if (item.type !== 'list_item') return helpers.parseChildren([item])[0];
    const content: JSONContent[] = [];
    for (const itemToken of item.tokens ?? []) {
      if (['paragraph', 'list', 'blockquote', 'code'].includes(itemToken.type)) {
        content.push(...helpers.parseChildren([itemToken]));
      } else if (itemToken.type === 'text' && itemToken.tokens) {
        content.push({ type: 'paragraph', content: helpers.parseChildren([itemToken]) });
      } else {
        const parsed = helpers.parseChildren([itemToken]);
        if (parsed.length > 0) content.push(...parsed);
      }
    }
    // an item starts with a paragraph, an empty one when it has no text (`1.` alone)
    if (content.length === 0) content.push({ type: 'paragraph', content: [] });
    return { type: 'listItem', content: ensureLeadingParagraph(content) };
  });
}

// ---- reading to-do lists: items by indent, the lines indented under one its nested blocks

const TASK_ITEM = /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/;

// a line's indent less `indentSize` columns, a tab running to the next tab stop
function dedentLine(line: string, indentSize: number): string {
  return line.replace(/^[ \t]*/, (whitespace) => {
    let columns = 0;
    for (const character of whitespace) {
      columns += character === '\t' ? TAB_STOP - (columns % TAB_STOP) : 1;
    }
    return ' '.repeat(Math.max(0, columns - indentSize));
  });
}

// the item's text joined with the lines that carry on its paragraph; the rest is nested blocks
function parseContinuation(mainContent: string, nestedContent: string, lexer: TokenizerHelpers) {
  const lines = nestedContent.split('\n');
  let continuation = 0;
  for (const line of lines) {
    if (!line.trim() || !lexer.isParagraphContinuation(line)) break;
    continuation += 1;
  }
  return {
    mainContent: [
      mainContent,
      ...lines.slice(0, continuation).map((line) => line.trimStart()),
    ].join('\n'),
    nestedContent: lines.slice(continuation).join('\n'),
  };
}

// the to-do items at the start of `src`, or nothing if it doesn't start with one
function parseTaskItems(
  src: string,
  lexer: TokenizerHelpers,
): { items: MarkdownToken[]; raw: string } | undefined {
  // `marked` asks at every block of a text: unless the first line that isn't blank is a to-do
  // item there is nothing to read, and the rest of the text is never looked at
  if (!TASK_ITEM.test(/^(?:[^\S\n]*\n)*([^\n]*)/.exec(src)?.[1] ?? '')) return undefined;
  const lines = src.split('\n');
  const items: MarkdownToken[] = [];
  let totalRaw = '';
  let i = 0;
  const baseIndentSize = 2;
  while (i < lines.length) {
    const currentLine = lines[i];
    const itemMatch = currentLine.match(TASK_ITEM);
    if (!itemMatch) {
      if (items.length > 0) break;
      if (currentLine.trim() === '') {
        i += 1;
        totalRaw = `${totalRaw}${currentLine}\n`;
        continue;
      }
      return undefined;
    }
    const data = {
      indentLevel: itemMatch[1].length,
      mainContent: itemMatch[4],
      checked: itemMatch[3].toLowerCase() === 'x',
    };
    totalRaw = `${totalRaw}${currentLine}\n`;
    const itemContent = [data.mainContent];
    i += 1;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine.trim() === '') {
        const nextNonEmpty = lines.slice(i + 1).findIndex((line) => line.trim() !== '');
        if (nextNonEmpty === -1) break;
        if ((lines[i + 1 + nextNonEmpty].match(/^(\s*)/)?.[1]?.length || 0) > data.indentLevel) {
          itemContent.push(nextLine);
          totalRaw = `${totalRaw}${nextLine}\n`;
          i += 1;
          continue;
        }
        break;
      }
      if ((nextLine.match(/^(\s*)/)?.[1]?.length || 0) > data.indentLevel) {
        itemContent.push(nextLine);
        totalRaw = `${totalRaw}${nextLine}\n`;
        i += 1;
      } else {
        break;
      }
    }
    let nestedTokens: MarkdownToken[] | undefined;
    const nestedContent = itemContent.slice(1);
    if (nestedContent.length > 0) {
      const continuation = parseContinuation(
        data.mainContent,
        nestedContent.map((line) => dedentLine(line, data.indentLevel + baseIndentSize)).join('\n'),
        lexer,
      );
      data.mainContent = continuation.mainContent;
      if (continuation.nestedContent.trim()) {
        nestedTokens = parseTaskListContent(continuation.nestedContent, lexer);
      }
    }
    items.push({
      type: 'taskItem',
      raw: '',
      mainContent: data.mainContent,
      indentLevel: data.indentLevel,
      checked: data.checked,
      bullet: itemMatch[2],
      checkedMark: itemMatch[3],
      text: data.mainContent,
      tokens: lexer.inlineTokens(data.mainContent),
      nestedTokens,
    });
  }
  if (items.length === 0) return undefined;
  return { items, raw: totalRaw.slice(0, src.length) };
}

// an item's nested blocks: a to-do list where they start with one, then the rest as markdown
function parseTaskListContent(content: string, lexer: TokenizerHelpers): MarkdownToken[] {
  const nested = parseTaskItems(content, lexer);
  if (!nested) return lexer.blockTokens(content);
  const taskList: MarkdownToken = { type: 'taskList', raw: nested.raw, items: nested.items };
  const remainder = content.slice(nested.raw.length);
  return remainder.trim() ? [taskList, ...lexer.blockTokens(remainder)] : [taskList];
}

// ---- the rules

function ensureLeadingParagraph(content: JSONContent[]): JSONContent[] {
  if (!content[0] || content[0].type === 'paragraph') return content;
  return [{ type: 'paragraph', content: [] }, ...content];
}

function hasEmptyLeadingParagraph(node: JSONContent): boolean {
  const first = node.content?.[0];
  return first?.type === 'paragraph' && !first.content?.length;
}

// an empty item nested in a list is written `&nbsp;`, as `-` alone would end the list
const EMPTY_ITEM_TEXT = '&nbsp;';

// `1. 2. three` on one line reads as an item holding a list; it is read as the item's text
function isSameLineOrderedListToken(token: MarkdownToken): boolean {
  const nested = token.tokens?.[0];
  return Boolean(
    token.text &&
    token.tokens?.length === 1 &&
    nested?.type === 'list' &&
    nested.ordered &&
    nested.raw === token.text,
  );
}

function listItemPrefix(context: RenderContext): string {
  if (context.parentType === 'orderedList') {
    const start = (context.meta.parentAttrs?.start as number) || 1;
    const delimiter = markupOf(context.meta.parentAttrs) === ')' ? ') ' : '. ';
    return listMarker(context.meta.parentAttrs?.type, start - 1 + (context.index || 0), delimiter);
  }
  return `${bulletOf(context)} `;
}

// the bullet of the list an item is in: the one it was written with, or the editor's `-`
function bulletOf(context: RenderContext): string {
  const markup = markupOf(context.meta.parentAttrs);
  return markup === '*' || markup === '+' ? markup : '-';
}

// the bullet a list was read with, when it isn't the editor's
function bulletMarkup(bullet: unknown): string | null {
  return bullet === '*' || bullet === '+' ? bullet : null;
}

export const listRules: Record<string, MarkdownRule> = {
  bulletList: {
    name: 'bulletList',
    token: 'list',
    parse: (token, helpers) => {
      if (token.type !== 'list' || token.ordered) return [];
      const content = token.items ? helpers.parseChildren(token.items) : [];
      // `marked` starts a new list where the bullet changes, so the first item's is the list's
      const bullet = bulletMarkup((token.items?.[0]?.raw || token.raw || '').trimStart()[0]);
      return bullet
        ? { type: 'bulletList', attrs: { markup: bullet }, content }
        : { type: 'bulletList', content };
    },
    render: (node, h) => (node.content ? h.renderChildren(node.content, '\n') : ''),
    indentsContent: true,
  },

  listItem: {
    name: 'listItem',
    token: 'list_item',
    parse: (token, helpers) => {
      if (token.type !== 'list_item') return [];
      let content: JSONContent[] = [];
      const tokens = token.tokens ?? [];
      if (tokens.length > 0) {
        if (isSameLineOrderedListToken(token)) {
          return {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: helpers.parseInline(helpers.tokenizeInline(token.text || '')),
              },
            ],
          };
        }
        const [first, ...rest] = tokens;
        if (first.type === 'heading') {
          return {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: helpers.parseInline(first.tokens ?? []) },
              ...(rest.length > 0 ? helpers.parseBlockChildren(rest) : []),
            ],
          };
        }
        if (tokens.some((t) => t.type === 'paragraph')) {
          content = helpers.parseBlockChildren(tokens);
        } else if (first.type === 'text' && first.tokens && first.tokens.length > 0) {
          content = [{ type: 'paragraph', content: helpers.parseInline(first.tokens) }];
          if (tokens.length > 1) content.push(...helpers.parseBlockChildren(tokens.slice(1)));
        } else {
          content = helpers.parseBlockChildren(tokens);
        }
      }
      if (content.length === 0) content = [{ type: 'paragraph', content: [] }];
      return { type: 'listItem', content: ensureLeadingParagraph(content) };
    },
    render: (node, h, context) => {
      const prefix = listItemPrefix(context);
      const output = renderNestedContent(node, h, prefix, {
        alignNestedToPrefix: context.parentType === 'orderedList',
      });
      if (!hasEmptyLeadingParagraph(node) || (context.level ?? 1) <= 1) return output;
      return `${prefix}${EMPTY_ITEM_TEXT}${output.slice(prefix.length)}`;
    },
  },

  orderedList: {
    name: 'orderedList',
    token: 'list',
    parse: (token, helpers) => {
      if (token.type !== 'list' || !token.ordered) return [];
      const start = token.start || 1;
      const content = token.items ? parseOrderedListItems(token.items, helpers) : [];
      const attrs: Record<string, unknown> = {};
      if (start !== 1) attrs.start = start;
      if (token.typeMarker) attrs.type = token.typeMarker;
      // `1)`: read by the tokenizer here, or from the first item where `marked` read the list
      const delimiter = token.delimiter ?? /^\s*\w+([.)])/.exec(token.raw || '')?.[1];
      if (delimiter === ')') attrs.markup = ')';
      return Object.keys(attrs).length > 0
        ? { type: 'orderedList', attrs, content }
        : { type: 'orderedList', content };
    },
    render: (node, h) => (node.content ? h.renderChildren(node.content, '\n') : ''),
    tokenizer: {
      name: 'orderedList',
      level: 'block',
      // read at a block's start only, never ending a paragraph
      start: () => -1,
      tokenize: (src, _tokens, lexer) => {
        const [items, consumed, lines] = collectOrderedListItemsFromSource(src);
        if (items.length === 0) return undefined;
        const listItems = buildNestedStructure(items, items[0].indent, lexer);
        if (listItems.length === 0) return undefined;
        return {
          type: 'list',
          ordered: true,
          start: items[0]?.number || 1,
          typeMarker: items[0]?.type,
          delimiter: items[0]?.delimiter,
          items: listItems,
          raw: lines.slice(0, consumed).join('\n'),
        };
      },
    },
    indentsContent: true,
  },

  taskList: {
    name: 'taskList',
    // the bullet is the first item's, which the tokenizer (or `parseList`, parser.ts) put on it
    parse: (token, h) =>
      h.createNode(
        'taskList',
        withMarkup({}, bulletMarkup(token.items?.[0]?.bullet)),
        h.parseChildren(token.items || []),
      ),
    render: (node, h) => (node.content ? h.renderChildren(node.content, '\n') : ''),
    tokenizer: {
      name: 'taskList',
      level: 'block',
      start: (src) => src.match(/^\s*[-+*]\s+\[([ xX])\]\s+/)?.index ?? -1,
      tokenize: (src, _tokens, lexer) => {
        const result = parseTaskItems(src, lexer);
        if (!result) return undefined;
        return { type: 'taskList', raw: result.raw, items: result.items };
      },
    },
    indentsContent: true,
  },

  taskItem: {
    name: 'taskItem',
    parse: (token, h) => {
      const content: JSONContent[] = [];
      if (token.tokens && token.tokens.length > 0) {
        content.push(h.createNode('paragraph', {}, h.parseInline(token.tokens)));
      } else if (token.text) {
        content.push(h.createNode('paragraph', {}, [h.createTextNode(token.text)]));
      } else {
        content.push(h.createNode('paragraph', {}, []));
      }
      if (token.nestedTokens && token.nestedTokens.length > 0) {
        content.push(...h.parseChildren(token.nestedTokens));
      }
      // `[X]`, kept for as long as the item is checked
      const markup = token.checked && token.checkedMark === 'X' ? 'X' : null;
      return h.createNode(
        'taskItem',
        withMarkup({ checked: token.checked || false }, markup),
        content,
      );
    },
    render: (node, h, context) => {
      const checked = markupOf(node.attrs) === 'X' ? 'X' : 'x';
      const prefix = `${bulletOf(context)} [${node.attrs?.checked ? checked : ' '}] `;
      return renderNestedContent(node, h, prefix, { indentMainContent: true });
    },
  },
};
