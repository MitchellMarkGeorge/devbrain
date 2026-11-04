import { mergeAttributes, Node } from '@tiptap/core';

/**
 * A markdown image, `![alt](url "title")`, drawn as a link chip with its alt text (or URL). The
 * image is never loaded: loading it would tell its sender when the note was read, and from where
 * (docs/security/untrusted-content.md). A click opens it through the host's onOpenUrl.
 */
export const ImageLink = Node.create({
  name: 'imageLink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-image-src]',
        getAttrs: (el) => ({
          src: el.getAttribute('data-image-src') ?? '',
          alt: el.textContent ?? '',
          title: el.getAttribute('title'),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-image-src': node.attrs.src,
        title: node.attrs.title ?? node.attrs.src,
      }),
      node.attrs.alt || node.attrs.src,
    ];
  },

  renderText({ node }) {
    return node.attrs.alt || node.attrs.src;
  },

  markdownTokenName: 'image',

  parseMarkdown(token) {
    return {
      type: 'imageLink',
      attrs: { src: token.href ?? '', alt: token.text ?? '', title: token.title || null },
    };
  },

  renderMarkdown(node) {
    const { src = '', alt = '', title } = node.attrs ?? {};
    const escapedAlt = String(alt).replace(/[\\[\]]/g, (char) => `\\${char}`);
    return title
      ? `![${escapedAlt}](${src} "${String(title).replace(/"/g, '\\"')}")`
      : `![${escapedAlt}](${src})`;
  },
});
