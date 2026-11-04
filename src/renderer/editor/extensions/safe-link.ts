import Link from '@tiptap/extension-link';
import { safeExternalUrl } from '@common/safe-url';

/**
 * TipTap's Link with DevBrain's rules (docs/security/untrusted-content.md):
 *
 * - The element only gets an href when safeExternalUrl accepts it, and a click never navigates
 *   the window: the editor's click handler passes a safe URL to the host's onOpenUrl. A refused
 *   target stays in the markdown (so saving loses nothing) but draws as plain text.
 * - Only http and https text is autolinked as you type or paste.
 * - A link keeps the form it was written in: `<https://…>` and a bare URL are written back the
 *   same way rather than as `[https://…](https://…)`.
 */

type LinkForm = 'inline' | 'angle' | 'bare';

function linkForm(token: { raw?: string; href?: string; text?: string }): LinkForm {
  const raw = token.raw ?? '';
  if (raw.startsWith('<') && raw.endsWith('>')) return 'angle';
  if (!raw.startsWith('[')) return 'bare';
  return 'inline';
}

export const SafeLink = Link.extend({
  addOptions() {
    return {
      ...this.parent!(),
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      shouldAutoLink: (url: string) => safeExternalUrl(url) !== null,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null, class: null },
    };
  },

  addAttributes() {
    return {
      ...this.parent!(),
      form: { default: 'inline', rendered: false },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { href, ...rest } = HTMLAttributes as { href?: string };
    const safe = safeExternalUrl(href);
    return safe ? ['a', { ...rest, href: safe }, 0] : ['span', { 'data-unsafe-link': '' }, 0];
  },

  parseMarkdown(token, helpers) {
    return helpers.applyMark('link', helpers.parseInline(token.tokens || []), {
      href: token.href,
      title: token.title || null,
      form: linkForm(token),
    });
  },

  renderMarkdown(node, helpers, ctx) {
    const href: string = node.attrs?.href ?? '';
    const title: string = node.attrs?.title ?? '';
    const form: LinkForm = node.attrs?.form ?? 'inline';
    // a mark renders around a placeholder for its text; the text itself is in meta.markText
    const text = helpers.renderChildren(node);
    const markText: string | undefined = ctx?.meta?.markText;
    // only while the text is still the URL and has nothing the serializer would escape; an edited
    // text needs the [text](url) form
    const plain = markText !== undefined && !/[\\`*_[\]~&<>]/.test(markText);
    if (!title && plain && form === 'angle' && markText === href) return `<${text}>`;
    if (
      !title &&
      plain &&
      form === 'bare' &&
      (markText === href || `http://${markText}` === href)
    ) {
      return text;
    }
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  },
});
