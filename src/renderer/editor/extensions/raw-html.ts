import { Node } from '@tiptap/core';
import type { MarkdownRule } from '../markdown/types';
import { findClosingTag, INLINE_TAGS } from './html-elements';

/**
 * HTML written in a note's markdown (`<details>`, `<kbd>`, a `<span>`), kept exactly as written and
 * shown as its source text, never rendered (docs/security/untrusted-content.md: "Not render raw
 * HTML"). Without these nodes the HTML would be turned into formatting where it is recognised and
 * dropped where it isn't, rewriting the note the first time it is saved.
 *
 * Block HTML arrives as marked's `html` token. Inline HTML has a tokenizer of its own, which runs
 * before marked's: each tag (or comment) is one node, and the text between tags stays editable
 * text. The tags DevBrain supports (html-elements.ts) are left to their own elements: `<br>`
 * always, the others when closed. What else marked reads as inline HTML (`<?php … ?>`, a
 * declaration, an empty `<kbd></kbd>`) is kept the same way, tag by tag (markdown/parser.ts).
 */

const ATTRIBUTE = `\\s+[A-Za-z_:][\\w.:-]*(?:\\s*=\\s*(?:[^\\s"'=<>\`]+|'[^']*'|"[^"]*"))?`;
const INLINE_HTML = new RegExp(
  `^(?:<[A-Za-z][A-Za-z0-9-]*(?:${ATTRIBUTE})*\\s*/?>` +
    `|</[A-Za-z][A-Za-z0-9-]*\\s*>|<!--[\\s\\S]*?-->)`,
);

// whether a supported element (html-elements.ts) reads this tag instead
function isSupportedTag(src: string, html: string): boolean {
  if (/^<br\s*\/?>$/i.test(html)) return true;
  const open = /^<([a-z]+)>$/i.exec(html);
  const tag = open?.[1].toLowerCase();
  return (
    tag !== undefined &&
    (INLINE_TAGS as readonly string[]).includes(tag) &&
    findClosingTag(src, tag, html.length) !== null
  );
}

function rawHtml(token: { raw?: string; text?: string }): string {
  return token.raw ?? token.text ?? '';
}

export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return { html: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'pre[data-raw-html]', getAttrs: (el) => ({ html: el.textContent ?? '' }) }];
  },

  renderHTML({ node }) {
    return ['pre', { 'data-raw-html': '' }, node.attrs.html];
  },
});

export const RawHtmlInline = Node.create({
  name: 'rawHtmlInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { html: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'code[data-raw-html]', getAttrs: (el) => ({ html: el.textContent ?? '' }) }];
  },

  renderHTML({ node }) {
    return ['code', { 'data-raw-html': '' }, node.attrs.html];
  },

  renderText({ node }) {
    return node.attrs.html;
  },
});

// read from marked's block `html` token (markdown/rules.ts)
export const rawHtmlBlockMarkdown: MarkdownRule = {
  name: 'rawHtmlBlock',
  token: 'html',

  parse(token) {
    if (!token.block) return [];
    // marked includes the blank lines after the block in raw; the serializer adds its own
    const html = rawHtml(token).replace(/\n+$/, '');
    return html ? { type: 'rawHtmlBlock', attrs: { html } } : [];
  },

  render(node) {
    return node.attrs?.html ?? '';
  },
};

export const rawHtmlInlineMarkdown: MarkdownRule = {
  name: 'rawHtmlInline',

  tokenizer: {
    name: 'rawHtmlInline',
    level: 'inline',
    start: (src) => src.search(/<[A-Za-z/!]/),
    tokenize(src) {
      const match = INLINE_HTML.exec(src);
      if (!match || isSupportedTag(src, match[0])) return undefined;
      return { type: 'rawHtmlInline', raw: match[0], text: match[0] };
    },
  },

  parse(token) {
    const html = rawHtml(token);
    return html ? { type: 'rawHtmlInline', attrs: { html } } : [];
  },

  render(node) {
    return node.attrs?.html ?? '';
  },
};
