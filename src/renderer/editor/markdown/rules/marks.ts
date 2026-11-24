import { markupOf } from '../markup';
import type { MarkdownRule, MarkdownToken, ParseHelpers } from '../types';

/**
 * Bold, italic, strikethrough and inline code. (Links: safe-link.ts; the HTML tags:
 * html-elements.ts.) Bold, italic and strikethrough keep the marker they were written with when it
 * isn't the editor's (`__`, `_`, a single `~`), in their `markup` attribute (markup.ts).
 */

// the shortest run of backticks the code's text doesn't hold, to fence it with
function shortestUnusedBacktickRun(text: string): number {
  const runs = new Set((text.match(/`+/g) || []).map((run) => run.length));
  let length = 1;
  while (runs.has(length)) length += 1;
  return length;
}

// a mark on a token's children, with the marker it was written with when that isn't the editor's
function markFrom(
  mark: string,
  token: MarkdownToken,
  helpers: ParseHelpers,
  markup: string | null,
) {
  const content = helpers.parseInline(token.tokens || []);
  return helpers.applyMark(mark, content, markup ? { markup } : undefined);
}

// `rendered`, a mark around its text, with `marker` on each side in place of `own`
function withMarker(node: { attrs?: Record<string, unknown> }, own: string, allowed: string) {
  const markup = markupOf(node.attrs);
  return markup === allowed ? allowed : own;
}

export const markRules: Record<string, MarkdownRule> = {
  bold: {
    name: 'bold',
    token: 'strong',
    parse: (token, helpers) =>
      markFrom('bold', token, helpers, token.raw.startsWith('__') ? '__' : null),
    render: (node, h) => {
      const marker = withMarker(node, '**', '__');
      return `${marker}${h.renderChildren(node)}${marker}`;
    },
    htmlReopen: { open: '<strong>', close: '</strong>' },
  },

  italic: {
    name: 'italic',
    token: 'em',
    parse: (token, helpers) =>
      markFrom('italic', token, helpers, token.raw.startsWith('_') ? '_' : null),
    render: (node, h) => {
      const marker = withMarker(node, '*', '_');
      return `${marker}${h.renderChildren(node)}${marker}`;
    },
    htmlReopen: { open: '<em>', close: '</em>' },
  },

  strike: {
    name: 'strike',
    token: 'del',
    parse: (token, helpers) =>
      markFrom('strike', token, helpers, /^~(?!~)/.test(token.raw) ? '~' : null),
    render: (node, h) => {
      const marker = withMarker(node, '~~', '~');
      return `${marker}${h.renderChildren(node)}${marker}`;
    },
  },

  code: {
    name: 'code',
    token: 'codespan',
    parse: (token, helpers) =>
      helpers.applyMark('code', [{ type: 'text', text: token.text || '' }]),
    render: (node, h, context) => {
      if (!node.content) return '';
      const markText = typeof context.meta.markText === 'string' ? context.meta.markText : '';
      const fence = '`'.repeat(shortestUnusedBacktickRun(markText));
      const padding = markText.startsWith('`') || markText.endsWith('`') ? ' ' : '';
      return `${fence}${padding}${h.renderChildren(node.content)}${padding}${fence}`;
    },
  },
};
