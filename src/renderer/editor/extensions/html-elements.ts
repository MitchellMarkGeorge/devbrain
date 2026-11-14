import {
  Extension,
  Mark,
  markInputRule,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
  type MarkdownToken,
  type MarkdownTokenizer,
} from '@tiptap/core';
import { Details, DetailsSummary } from '@tiptap/extension-details';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import { kbdVariants } from '@renderer/components/ui/Kbd';

/**
 * The HTML tags DevBrain notes support, for what GitHub-flavoured markdown has no syntax for. Each
 * is written exactly as GitHub reads it, so a note renders the same on GitHub, and each is a real
 * element in the editor with no attributes taken from the text. Every other tag stays text (see
 * raw-html.ts).
 *
 * | Tag                                  | Element                         |
 * | ------------------------------------ | ------------------------------- |
 * | `<u>`                                | underline (⌘U)                  |
 * | `<kbd>`                              | a key (⌘⇧K)                     |
 * | `<sub>`, `<sup>`                     | subscript (⌘,), superscript (⌘.) |
 * | `<br>`                               | a line break (in table cells)   |
 * | `<details>` with `<summary>`         | a collapsible section; the summary is plain text |
 *
 * Typing a tag pair, such as `<kbd>K</kbd>`, applies the formatting too.
 */

export const INLINE_TAGS = ['u', 'kbd', 'sub', 'sup'] as const;
type InlineTag = (typeof INLINE_TAGS)[number];

/**
 * A tokenizer for `<tag>…</tag>` on one line, the content parsed as markdown. A closing tag inside
 * a code span does not count, and an unclosed tag is left to raw-html.ts.
 */
function inlineTagTokenizer(name: string, tag: InlineTag): MarkdownTokenizer {
  const open = `<${tag}>`;
  return {
    name,
    level: 'inline',
    start: (src) => src.toLowerCase().indexOf(open),
    tokenize(src, _tokens, lexer) {
      if (!src.toLowerCase().startsWith(open)) return undefined;
      const end = findClosingTag(src, tag, open.length);
      if (end === null) return undefined;
      const text = src.slice(open.length, end.index);
      if (!text) return undefined;
      return {
        type: name,
        raw: src.slice(0, end.index + end.length),
        text,
        tokens: lexer.inlineTokens(text),
      };
    },
  };
}

// where `</tag>` closes the tag opened before `from`: outside code spans, on the same line
export function findClosingTag(
  src: string,
  tag: string,
  from: number,
): { index: number; length: number } | null {
  const delimiters = new RegExp(`\\\\[\\s\\S]|\`+|\\n|</${tag}\\s*>`, 'gi');
  delimiters.lastIndex = from;
  let match = delimiters.exec(src);
  while (match) {
    if (match[0] === '\n') return null;
    if (match[0].startsWith('`')) {
      const span = new RegExp(`^${match[0]}[^\`][\\s\\S]*?[^\`]?${match[0]}(?!\`)`).exec(
        src.slice(match.index),
      );
      if (span) delimiters.lastIndex = match.index + span[0].length;
    } else if (match[0].startsWith('</')) {
      return { index: match.index, length: match[0].length };
    }
    match = delimiters.exec(src);
  }
  return null;
}

function tagMarkdown(name: string, tag: InlineTag) {
  return {
    markdownTokenName: name,
    markdownTokenizer: inlineTagTokenizer(name, tag),
    parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) =>
      helpers.applyMark(name, helpers.parseInline(token.tokens ?? [])),
    renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
      `<${tag}>${helpers.renderChildren(node)}</${tag}>`,
    // when marks overlap, the serializer reopens this one with its tag
    markdownOptions: { htmlReopen: { open: `<${tag}>`, close: `</${tag}>` } },
  };
}

// typing `<tag>text</tag>` after a space or at the start of a line applies the mark
function tagInputRule(tag: InlineTag) {
  return new RegExp(`(?:^|\\s)(<${tag}>([^<]+)</${tag}>)$`, 'i');
}

export const DocumentUnderline = Underline.extend({
  addInputRules() {
    return [markInputRule({ find: tagInputRule('u'), type: this.type })];
  },
});

export const Kbd = Mark.create({
  name: 'kbd',
  // a key holds only its own text
  excludes: '_',
  code: true,

  parseHTML() {
    return [{ tag: 'kbd' }];
  },

  // drawn as the design system's Kbd
  renderHTML() {
    return ['kbd', { class: kbdVariants() }, 0];
  },

  ...tagMarkdown('kbd', 'kbd'),

  addInputRules() {
    return [markInputRule({ find: tagInputRule('kbd'), type: this.type })];
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-k': () => this.editor.commands.toggleMark(this.name) };
  },
});

export const DocumentSubscript = Subscript.extend({
  ...tagMarkdown('subscript', 'sub'),
  addInputRules() {
    return [markInputRule({ find: tagInputRule('sub'), type: this.type })];
  },
});

export const DocumentSuperscript = Superscript.extend({
  ...tagMarkdown('superscript', 'sup'),
  addInputRules() {
    return [markInputRule({ find: tagInputRule('sup'), type: this.type })];
  },
});

// `<br>` and `<br/>` read as a hard break; a hard break is written `<br>` only in a table cell,
// where a cell must stay on one line, and as GFM's two trailing spaces elsewhere
export const HtmlBreak = Extension.create({
  name: 'htmlBreak',
  markdownTokenizer: {
    name: 'htmlBreak',
    level: 'inline',
    start: (src) => src.search(/<br\s*\/?>/i),
    tokenize(src) {
      const match = /^<br\s*\/?>/i.exec(src);
      return match ? { type: 'br', raw: match[0] } : undefined;
    },
  },
});

/**
 * A collapsible section, written as GitHub reads it:
 *
 *   <details>
 *   <summary>Title</summary>
 *
 *   Any markdown.
 *
 *   </details>
 *
 * `<details open>` keeps it open. The blank lines are what lets GitHub read the body as markdown.
 */
const DETAILS_OPEN = /^<details(\s+open(?:=(?:""|''|"open"|'open'))?)?\s*>/i;
const SUMMARY = /^\s*<summary>([\s\S]*?)<\/summary>[ \t]*\n?/i;

// GitHub shows a summary's text as it is, markdown and all, so the summary is plain text: written
// with only what HTML needs escaped, and read back the same way
function encodeSummary(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function decodeSummary(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// a summary is one line of plain text: no formatting, no line breaks
export const DocumentDetailsSummary = DetailsSummary.extend({ marks: '' });

// the end of the `<details>` that opens `src`, past nested sections and code fences
function findDetailsEnd(src: string): { bodyEnd: number; end: number } | null {
  const pattern = /^ {0,3}(```|~~~)|<details[\s>]|<\/details\s*>/gim;
  let depth = 0;
  let fence: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src))) {
    const found = match[0];
    if (match[1]) {
      if (!fence) fence = match[1];
      else if (fence === match[1]) fence = null;
      continue;
    }
    if (fence) continue;
    if (found.toLowerCase().startsWith('<details')) {
      depth += 1;
    } else if (--depth === 0) {
      // the rest of the closing tag's line belongs to it
      const lineEnd = /^[ \t]*(?:\n|$)/.exec(src.slice(match.index + found.length));
      if (!lineEnd) return null;
      return { bodyEnd: match.index, end: match.index + found.length + lineEnd[0].length };
    }
  }
  return null;
}

export const DocumentDetails = Details.extend({
  markdownTokenName: 'details',

  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src) => src.search(/<details[\s>]/i),
    tokenize(src, _tokens, lexer) {
      const open = DETAILS_OPEN.exec(src);
      if (!open) return undefined;
      const bounds = findDetailsEnd(src);
      if (!bounds) return undefined;
      let body = src.slice(open[0].length, bounds.bodyEnd);
      const summary = SUMMARY.exec(body);
      if (summary) body = body.slice(summary[0].length);
      return {
        type: 'details',
        raw: src.slice(0, bounds.end),
        open: Boolean(open[1]),
        summary: summary ? decodeSummary(summary[1].trim()) : '',
        tokens: lexer.blockTokens(body.trim()),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const summary = token.summary ? [{ type: 'text', text: token.summary }] : [];
    const body = helpers.parseChildren(token.tokens ?? []);
    return {
      type: 'details',
      attrs: { open: token.open },
      content: [
        { type: 'detailsSummary', content: summary },
        { type: 'detailsContent', content: body.length ? body : [{ type: 'paragraph' }] },
      ],
    };
  },

  renderMarkdown(node, helpers) {
    const [summary, content] = node.content ?? [];
    const title = encodeSummary(
      (summary?.content ?? []).map((child: JSONContent) => child.text ?? '').join(''),
    );
    const body = content?.content ? helpers.renderChildren(content.content, '\n\n').trim() : '';
    const openTag = node.attrs?.open ? '<details open>' : '<details>';
    return [
      openTag,
      `<summary>${title}</summary>`,
      '',
      ...(body ? [body, ''] : []),
      '</details>',
    ].join('\n');
  },
}).configure({ persist: true });
