import type { MarkdownRule } from '../types';

/** Bold, italic, strikethrough and inline code. (Links: safe-link.ts; the HTML tags: html-elements.ts.) */

// the shortest run of backticks the code's text doesn't hold, to fence it with
function shortestUnusedBacktickRun(text: string): number {
  const runs = new Set((text.match(/`+/g) || []).map((run) => run.length));
  let length = 1;
  while (runs.has(length)) length += 1;
  return length;
}

export const markRules: Record<string, MarkdownRule> = {
  bold: {
    name: 'bold',
    token: 'strong',
    parse: (token, helpers) => helpers.applyMark('bold', helpers.parseInline(token.tokens || [])),
    render: (node, h) => `**${h.renderChildren(node)}**`,
    htmlReopen: { open: '<strong>', close: '</strong>' },
  },

  italic: {
    name: 'italic',
    token: 'em',
    parse: (token, helpers) => helpers.applyMark('italic', helpers.parseInline(token.tokens || [])),
    render: (node, h) => `*${h.renderChildren(node)}*`,
    htmlReopen: { open: '<em>', close: '</em>' },
  },

  strike: {
    name: 'strike',
    token: 'del',
    parse: (token, helpers) => helpers.applyMark('strike', helpers.parseInline(token.tokens || [])),
    render: (node, h) => `~~${h.renderChildren(node)}~~`,
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
