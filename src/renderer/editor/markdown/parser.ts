import type { JSONContent } from '@tiptap/core';
import type { Lexer, Marked } from 'marked';
import { decodeEntities } from './entities';
import { createLexer } from './lexer';
import type { RuleTable } from './rules';
import type {
  LinkDefinitions,
  MarkResult,
  MarkdownToken,
  ParseHelpers,
  ParseResult,
  ParsedText,
  TokenRead,
} from './types';

/**
 * Markdown to the editor's JSON: `marked` reads the text into tokens, and the rule for each token's
 * type (rules.ts) makes its nodes. A token no rule reads gives its children, or nothing.
 *
 * What it does besides, as TipTap's markdown package did, so notes read as they always have:
 *
 * - Blank lines beyond the one between two blocks read as empty paragraphs, at the top level of
 *   the document and in a quote, a callout or a collapsible section (`parseBlockChildren`), so the
 *   space someone left stays. One at the start or end of a text counts in full.
 * - A list that mixes to-dos and bullets is split into a to-do list and a bullet list at each
 *   change (`parseList`).
 * - Inline marks are put on the text nodes they span, merging neighbours with the same marks.
 *
 * `read` gives, with the document, where in the text each top-level token was read from and the
 * nodes it gave: what the source map (source.ts) is made from.
 */

// blank lines a token's raw ended with, which marked folds into the block before them
const TRAILING_BLANK_LINES = /\n[^\S\n]*(?:\n[^\S\n]*)+$/;

const TASK_ITEM = /^(\s*)[-+*]\s+\[([ xX])\]\s+/;

function isTaskItem(item: MarkdownToken): { isTask: boolean; checked?: boolean } {
  const match = (item.raw || item.text || '').match(TASK_ITEM);
  return match ? { isTask: true, checked: match[2].toLowerCase() === 'x' } : { isTask: false };
}

// a block's trailing blank lines as a `space` token of their own, unless one follows it already
function extractAbsorbedBlankLines(tokens: MarkdownToken[]): MarkdownToken[] {
  return tokens.flatMap((token, index) => {
    if (token.type === 'space' || tokens[index + 1]?.type === 'space') return [token];
    const blank = (token.raw || '').match(TRAILING_BLANK_LINES);
    if (!blank) return [token];
    return [
      { ...token, raw: (token.raw || '').slice(0, -blank[0].length) },
      { type: 'space', raw: blank[0] },
    ];
  });
}

function isMarkResult(result: unknown): result is MarkResult {
  return Boolean(result && typeof result === 'object' && 'mark' in result);
}

function normalizeResult(result: ParseResult): JSONContent | JSONContent[] | null {
  if (!result) return null;
  if (isMarkResult(result)) return result.content;
  return result;
}

function sameAttrs(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]),
  );
}

// the same marks, in any order
function sameMarks(a: NonNullable<JSONContent['marks']>, b: NonNullable<JSONContent['marks']>) {
  if (a.length !== b.length) return false;
  const used = b.map(() => false);
  return a.every((markA) => {
    const index = b.findIndex(
      (markB, i) => !used[i] && markA.type === markB.type && sameAttrs(markA.attrs, markB.attrs),
    );
    if (index === -1) return false;
    used[index] = true;
    return true;
  });
}

export class MarkdownParser {
  // the lexer of the text being parsed, so inline text read later knows its reference links
  private activeLexer: Lexer | null = null;
  private readonly helpers: ParseHelpers;

  constructor(
    private readonly rules: RuleTable,
    private readonly marked: Marked,
  ) {
    this.helpers = {
      parseInline: (tokens) => this.parseInline(tokens),
      tokenizeInline: (src) => this.tokenizeInline(src),
      parseChildren: (tokens) => this.parseTokens(tokens),
      parseBlockChildren: (tokens) => this.parseTokens(tokens, true),
      createTextNode: (text, marks) => ({ type: 'text', text, marks: marks || undefined }),
      createNode: (type, attrs, content) => {
        const node: JSONContent = {
          type,
          attrs: attrs || undefined,
          content: content || undefined,
        };
        if (!attrs || Object.keys(attrs).length === 0) delete node.attrs;
        return node;
      },
      applyMark: (mark, content, attrs) => ({
        mark,
        content,
        attrs: attrs && Object.keys(attrs).length > 0 ? attrs : undefined,
      }),
    };
  }

  parse(markdown: string): JSONContent {
    return this.read(markdown).doc;
  }

  /**
   * The document, and its top-level tokens with the nodes each gave and where it stands in the
   * text (with `\n` line ends, as `marked` reads it).
   */
  read(markdown: string): ParsedText {
    const previous = this.activeLexer;
    const lexer = createLexer(this.marked);
    this.activeLexer = lexer;
    try {
      const lexed = lexer.lex(markdown);
      const read = this.readTokens(lexed as MarkdownToken[], true);
      const text = markdown.replace(/\r\n|\r/g, '\n');
      return {
        doc: { type: 'doc', content: read.flatMap(({ nodes }) => nodes) },
        text,
        tokens: this.locate(text, read),
        links: lexed.links as LinkDefinitions,
      };
    } finally {
      this.activeLexer = previous;
    }
  }

  /**
   * Each token's place in the text: its `raw`, found from the end of the token before it. The
   * raws don't always follow one another: `marked` reads a definition of a label that is defined
   * already and gives no token for it. Such definitions (and blank lines with them) are given as
   * tokens here, marked `repeated`, so the tokens cover the text end to end. Null when anything
   * else stands between two tokens: then the text can't be lined up with what was read.
   */
  private locate(text: string, read: Omit<TokenRead, 'from' | 'to'>[]): TokenRead[] | null {
    const located: TokenRead[] = [];
    let offset = 0;
    const skipTo = (next: number): boolean => {
      if (next === offset) return true;
      const skipped = next > offset ? this.repeatedDefinitions(text, offset, next) : null;
      if (!skipped) return false;
      located.push(...skipped);
      offset = next;
      return true;
    };
    for (const { token, nodes } of read) {
      const raw = token.raw || '';
      if (!text.startsWith(raw, offset) && !skipTo(text.indexOf(raw, offset))) return null;
      located.push({ token, nodes, from: offset, to: offset + raw.length });
      offset += raw.length;
    }
    return skipTo(text.length) ? located : null;
  }

  // The text from `from` to `to` as definitions and blank lines, or null when it holds anything
  // else. Read on its own it gives each label's first definition and drops the repeats after it
  // in turn, so it is read again from wherever one was dropped.
  private repeatedDefinitions(text: string, from: number, to: number): TokenRead[] | null {
    const found: TokenRead[] = [];
    let offset = from;
    while (offset < to) {
      const start = offset;
      for (const token of createLexer(this.marked).lex(text.slice(offset, to))) {
        if (!text.startsWith(token.raw, offset)) break;
        if (token.type !== 'def' && token.type !== 'space') return null;
        const end = offset + token.raw.length;
        found.push({
          token: token as MarkdownToken,
          nodes: [],
          from: offset,
          to: end,
          repeated: token.type === 'def',
        });
        offset = end;
      }
      if (offset === start) return null;
    }
    return found;
  }

  private tokenizeInline(src: string): MarkdownToken[] {
    return (this.activeLexer ?? createLexer(this.marked)).inlineTokens(src) as MarkdownToken[];
  }

  private parseTokens(tokens: MarkdownToken[], emptyParagraphsFromSpace = false): JSONContent[] {
    return this.readTokens(tokens, emptyParagraphsFromSpace).flatMap(({ nodes }) => nodes);
  }

  // The nodes each token gives. With `emptyParagraphsFromSpace` the tokens are the ones left once
  // a block's trailing blank lines are a `space` token of their own, so a block's `raw` ends at
  // its last line.
  private readTokens(
    tokens: MarkdownToken[],
    emptyParagraphsFromSpace = false,
  ): { token: MarkdownToken; nodes: JSONContent[] }[] {
    const normalized = emptyParagraphsFromSpace ? extractAbsorbedBlankLines(tokens) : tokens;
    const blockIndexes = normalized.flatMap((token, index) =>
      token.type === 'space' ? [] : [index],
    );
    let previousBlock = -1;
    let nextBlockPointer = 0;
    return normalized.map((token, index) => {
      while (nextBlockPointer < blockIndexes.length && blockIndexes[nextBlockPointer] < index) {
        previousBlock = blockIndexes[nextBlockPointer];
        nextBlockPointer += 1;
      }
      if (emptyParagraphsFromSpace && token.type === 'space') {
        const nextBlock = blockIndexes[nextBlockPointer] ?? -1;
        return { token, nodes: this.emptyParagraphsFromSpace(token, previousBlock, nextBlock) };
      }
      const parsed = this.parseToken(token, emptyParagraphsFromSpace);
      if (parsed === null) return { token, nodes: [] };
      return { token, nodes: Array.isArray(parsed) ? parsed : [parsed] };
    });
  }

  // a blank line between two blocks is their separator; each other one is an empty paragraph
  private emptyParagraphsFromSpace(
    token: MarkdownToken,
    previousBlock: number,
    nextBlock: number,
  ): JSONContent[] {
    const separators = ((token.raw || '').replace(/\r\n/g, '\n').match(/\n\n/g) || []).length;
    if (separators === 0) return [];
    const atAnEnd = previousBlock === -1 || nextBlock === -1;
    const count = Math.max(separators - (atAnEnd ? 0 : 1), 0);
    return Array.from({ length: count }, () => ({ type: 'paragraph', content: [] }));
  }

  private parseToken(
    token: MarkdownToken,
    emptyParagraphsFromSpace = false,
  ): JSONContent | JSONContent[] | null {
    if (!token.type) return null;
    if (token.type === 'list') return this.parseList(token);
    return this.parseWithRules(token, emptyParagraphsFromSpace);
  }

  // the first rule for the token's type that makes something of it, or the fallback
  private parseWithRules(
    token: MarkdownToken,
    emptyParagraphsFromSpace = false,
  ): JSONContent | JSONContent[] | null {
    for (const rule of this.rules.parsersOf(token.type)) {
      const normalized = normalizeResult(rule.parse!(token, this.helpers));
      if (normalized && (!Array.isArray(normalized) || normalized.length > 0)) return normalized;
    }
    return this.parseFallback(token, emptyParagraphsFromSpace);
  }

  /**
   * A list that mixes to-do and bullet items is split into a to-do list and a bullet list at each
   * change. (A list of only to-dos is read by the task list's own tokenizer.)
   */
  private parseList(token: MarkdownToken): JSONContent | JSONContent[] | null {
    const items: MarkdownToken[] = token.items ?? [];
    if (items.length === 0) return this.parseWithRules(token);
    const hasTask = items.some((item) => isTaskItem(item).isTask);
    const hasOther = items.some((item) => !isTaskItem(item).isTask);
    if (!hasTask || !hasOther || this.rules.parsersOf('taskList').length === 0) {
      return this.parseWithRules(token);
    }

    const groups: { type: string; items: MarkdownToken[] }[] = [];
    for (const item of items) {
      const { isTask, checked } = isTaskItem(item);
      let processed = item;
      if (isTask) {
        const lines = (item.raw || item.text || '').split('\n');
        const [, bullet, checkedMark, mainContent = ''] =
          lines[0].match(/^\s*([-+*])\s+\[([ xX])\]\s+(.*)$/) ?? [];
        let nestedTokens: MarkdownToken[] = [];
        const nestedLines = lines.slice(1);
        if (nestedLines.join('\n').trim()) {
          const nonEmpty = nestedLines.filter((line) => line.trim());
          const minIndent = Math.min(
            ...nonEmpty.map((line) => line.length - line.trimStart().length),
          );
          const nested = nestedLines
            .map((line) => (line.trim() ? line.slice(minIndent) : ''))
            .join('\n')
            .trim();
          if (nested) nestedTokens = this.marked.lexer(`${nested}\n`) as MarkdownToken[];
        }
        processed = {
          type: 'taskItem',
          raw: '',
          mainContent,
          checked: checked ?? false,
          // the markers the to-do list's own tokenizer puts on its items (rules/lists.ts)
          bullet,
          checkedMark,
          text: mainContent,
          tokens: this.tokenizeInline(mainContent),
          nestedTokens,
        };
      }
      const type = isTask ? 'taskList' : 'list';
      if (groups.at(-1)?.type === type) groups.at(-1)!.items.push(processed);
      else groups.push({ type, items: [processed] });
    }

    const results = groups.flatMap((group) => {
      const parsed = this.parseToken({ ...token, type: group.type, items: group.items });
      if (!parsed) return [];
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    return results.length > 0 ? results : null;
  }

  private parseFallback(
    token: MarkdownToken,
    emptyParagraphsFromSpace: boolean,
  ): JSONContent | JSONContent[] | null {
    switch (token.type) {
      case 'paragraph':
        return { type: 'paragraph', content: token.tokens ? this.parseInline(token.tokens) : [] };
      case 'heading':
        return {
          type: 'heading',
          attrs: { level: token.depth || 1 },
          content: token.tokens ? this.parseInline(token.tokens) : [],
        };
      case 'text':
        return { type: 'text', text: decodeEntities(token.text || '') };
      case 'escape':
        return { type: 'text', text: token.text || '' };
      case 'html':
        // block HTML is kept by its rule (raw-html.ts); what reaches here is only blank
        return null;
      case 'space':
        return null;
      default:
        return token.tokens ? this.parseTokens(token.tokens, emptyParagraphsFromSpace) : null;
    }
  }

  /** Inline tokens as text and inline nodes, each mark put on the text it spans. */
  private parseInline(tokens: MarkdownToken[]): JSONContent[] {
    const result: JSONContent[] = [];
    for (const token of tokens) {
      if (token.type === 'text') {
        result.push({ type: 'text', text: decodeEntities(token.text || '') });
      } else if (token.type === 'escape') {
        result.push({ type: 'text', text: token.text || '' });
      } else if (token.type === 'html') {
        // HTML that no tokenizer took (raw-html.ts takes tags and comments): kept as written
        const html = String(token.raw ?? token.text ?? '');
        if (html) result.push({ type: 'rawHtmlInline', attrs: { html } });
      } else if (token.type) {
        const [rule] = this.rules.parsersOf(token.type);
        if (rule) {
          const parsed = rule.parse!(token, this.helpers);
          if (isMarkResult(parsed)) {
            result.push(...this.applyMark(parsed.mark, parsed.content, parsed.attrs));
          } else {
            const normalized = normalizeResult(parsed);
            if (Array.isArray(normalized)) result.push(...normalized);
            else if (normalized) result.push(normalized);
          }
        } else if (token.tokens) {
          result.push(...this.parseInline(token.tokens));
        }
      }
    }
    // neighbouring text with the same marks is one text node
    for (let i = result.length - 1; i > 0; i -= 1) {
      const current = result[i];
      const previous = result[i - 1];
      if (
        current.type === 'text' &&
        previous.type === 'text' &&
        sameMarks(current.marks || [], previous.marks || [])
      ) {
        previous.text = (previous.text || '') + (current.text || '');
        result.splice(i, 1);
      }
    }
    return result;
  }

  // the mark goes after the marks already on the text: the innermost mark comes first
  private applyMark(
    mark: string,
    content: JSONContent[],
    attrs?: Record<string, unknown>,
  ): JSONContent[] {
    return content.map((node) => {
      if (node.type === 'text') {
        const added = attrs ? { type: mark, attrs } : { type: mark };
        return { ...node, marks: [...(node.marks || []), added] };
      }
      return {
        ...node,
        content: node.content ? this.applyMark(mark, node.content, attrs) : undefined,
      };
    });
  }
}
