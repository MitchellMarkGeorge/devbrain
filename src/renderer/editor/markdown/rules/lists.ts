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
 * Bullet, numbered and to-do lists. `marked` reads bullet lists; numbered lists and to-do lists
 * have tokenizers of their own, which nest items by their indent. A numbered list is numbers
 * only, as GitHub's is (no `a.` or `iv)`).
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

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);
const isList = (node?: JSONContent) => LIST_TYPES.has(node?.type ?? '');

/**
 * An item after its marker: its first block on the marker's line, each block after it on lines
 * of its own, and every line but the first indented under the item's text so it stays the
 * item's (by the marker's width in a numbered list, where `alignNestedToPrefix`).
 */
function renderNestedContent(
  node: JSONContent,
  h: RenderHelpers,
  prefix: string,
  options: {
    alignNestedToPrefix?: boolean;
    listOnMarkerLine?: boolean;
    bareMarkerWhenEmpty?: boolean;
  } = {},
): string {
  if (!node || !Array.isArray(node.content)) return '';
  const [content, ...children] = node.content;
  const configured = h.indent('');
  const indentation =
    options.alignNestedToPrefix && columnWidth(configured) < columnWidth(prefix)
      ? ' '.repeat(columnWidth(prefix))
      : configured;
  // (a blank line stays empty: it is the item's without indentation)
  const indented = (text: string, firstLine = true) =>
    text
      .split('\n')
      .map((line, index) =>
        (index === 0 && !firstLine) || line === '' ? line : indentation + line,
      )
      .join('\n');

  const first = indented(h.renderChildren([content]), false);
  // (`- ` and a line end isn't an item's start: a marker with no text on its line has no space)
  let output = first === '' && options.bareMarkerWhenEmpty ? prefix.trimEnd() : prefix + first;
  children.forEach((child, index) => {
    const childContent = h.renderChild(child, index + 1);
    if (childContent === undefined || childContent === null) return;
    const previous = node.content![index];
    if (index === 0 && options.listOnMarkerLine && isList(child) && !previous.content?.length) {
      // a list in an item with no text of its own starts on the marker's line (`- - item`):
      // under a marker alone it would be read as a list after an empty one
      output = prefix + indented(childContent, false);
      return;
    }
    // A blank line before a paragraph, which would run on from the block above it, and around
    // HTML, which goes on to the next blank line and doesn't always end a paragraph.
    const apart =
      child.type === 'paragraph' ||
      child.type === 'rawHtmlBlock' ||
      previous.type === 'rawHtmlBlock';
    output += `${apart ? '\n\n' : '\n'}${indented(childContent)}`;
  });
  return output;
}

// ---- reading numbered lists

/**
 * A numbered item's line: (1) indent, (2) number, (3) `.` or `)`, (4) its text. The number is
 * digits only, as in GitHub's markdown and as typing `1. ` in the editor makes a list: a letter
 * or a word before a full stop is the start of a sentence ("No. I think so", "a. m."), never an
 * item.
 */
const ORDERED_LIST_ITEM = /^(\s*)(\d{1,9})([.)])\s+(.*)$/;

// a line as a numbered item: its indent, number, delimiter and text; null when it isn't one
function orderedItemOf(line: string): RegExpMatchArray | null {
  return line.match(ORDERED_LIST_ITEM);
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

// An item's blocks after its first paragraph, without the blank lines around them and the
// indentation they all share (a fence one space past the item's text, and its code with it).
function withoutSharedIndent(lines: string[]): string {
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)![0].length);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => (line.trim() ? line.slice(shared) : ''))
    .join('\n')
    .replace(/^\n+/, '')
    .trimEnd();
}

interface OrderedItem {
  indent: number;
  number: number;
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
    // another delimiter starts another list (`1.` then `1)`), as another bullet does
    const first = items[0];
    if (first && indentLevel <= first.indent && delimiter !== first.delimiter) break;
    const itemNumber = parseInt(marker, 10);
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
    const additional = withoutSharedIndent(blockLines);
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
    // always a number: letters and roman numerals (`<ol type="a">`, pasted) are no markdown
    return `${start + (context.index || 0)}${delimiter}`;
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
        // In an item with no blank line in it `marked` gives lines of text as `text` tokens:
        // each is a paragraph, wherever in the item it is.
        content = helpers.parseBlockChildren(
          tokens.map((child) =>
            child.type === 'text' && child.tokens ? { ...child, type: 'paragraph' } : child,
          ),
        );
      }
      if (content.length === 0) content = [{ type: 'paragraph', content: [] }];
      return { type: 'listItem', content: ensureLeadingParagraph(content) };
    },
    render: (node, h, context) => {
      const prefix = listItemPrefix(context);
      // (a numbered item's first line is read as its text, so a list can't start on it)
      const ordered = context.parentType === 'orderedList';
      const listFirst = !ordered && hasEmptyLeadingParagraph(node) && isList(node.content?.[1]);
      const output = renderNestedContent(node, h, prefix, {
        alignNestedToPrefix: ordered,
        listOnMarkerLine: listFirst,
        bareMarkerWhenEmpty: !ordered,
      });
      if (!hasEmptyLeadingParagraph(node) || listFirst || (context.level ?? 1) <= 1) return output;
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
      return renderNestedContent(node, h, prefix);
    },
  },
};
