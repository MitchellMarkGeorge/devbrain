import { Extension, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Copy and paste in markdown, so notes move between DevBrain, GitHub, VS Code and chat apps intact.
 *
 * - Copy puts the selection's markdown on the clipboard as plain text, beside the HTML that rich
 *   apps read. Inside a code block it copies the code as it is.
 * - Pasting plain text that looks like markdown reads it as markdown: headings, lists, tables,
 *   fences, quotes, links. Other plain text, a paste into a code block, and Shift+⌘V paste text.
 * - Pasting from VS Code (which also puts its own HTML on the clipboard) reads a markdown file's
 *   text as markdown, and code from any other file as a code block in its language.
 * - Pasting HTML that is only preformatted text (a `<pre>`, as code viewers and plain-text panels
 *   copy it) reads it as markdown when it is tagged as markdown, or untagged with at least two
 *   signs of markdown; otherwise it stays a code block. Two signs, because code has one easily:
 *   a shell or Python comment reads like a heading.
 * - Pasting from a web page or a document keeps TipTap's reading of its HTML.
 */

// lines and spans that only markdown would write; one is enough to read the text as markdown
const MARKDOWN_SIGNS = [
  /^ {0,3}#{1,6}[ \t]+\S/m, // a heading
  /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/m, // a list item
  /^ {0,3}(?:```|~~~)/m, // a code fence
  /^ {0,3}>[ \t]?\S/m, // a quote
  /^ {0,3}\|?.*\|.*\n {0,3}\|?[ \t]*:?-{3,}/m, // a table: a row over its delimiter row
  /\[[^\]\n]+\]\([^)\s]+\)/, // a link
  /(?:\*\*|__)\S[^\n]*?\S?(?:\*\*|__)/, // bold
  /`[^`\n]+`/, // inline code
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_SIGNS.some((sign) => sign.test(text));
}

// how many different kinds of markdown the text shows
export function markdownSigns(text: string): number {
  return MARKDOWN_SIGNS.filter((sign) => sign.test(text)).length;
}

/**
 * The language of clipboard HTML that is only preformatted text: one `<pre>` (with a `<code>` or
 * highlighting spans in it, perhaps), '' when it names no language; null for any other HTML. The
 * HTML is parsed in an inert document, which runs no scripts and loads nothing.
 */
const NO_CONTENT = new Set(['META', 'LINK', 'STYLE', 'TITLE', 'SCRIPT', 'BASE']);

export function preformattedLanguage(html: string): string | null {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  // browsers lead a copy with <meta charset> and the like, which carry no content
  const nodes = [...body.childNodes].filter((node) =>
    node.nodeType === Node.ELEMENT_NODE
      ? !NO_CONTENT.has(node.nodeName)
      : node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  const pre = nodes.length === 1 ? nodes[0] : null;
  if (!(pre instanceof HTMLPreElement)) return null;
  const code = pre.querySelector('code');
  const classes = `${pre.className} ${code?.className ?? ''}`;
  const tagged = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(classes)?.[1];
  return tagged ?? pre.getAttribute('lang') ?? code?.getAttribute('lang') ?? '';
}

const isMarkdownLanguage = (language: string) => /^(?:markdown|md|mdx|gfm)$/i.test(language);

// the markdown as a slice that pastes like copied content: open at both ends, so a single line
// joins the paragraph it lands in
function markdownSlice(editor: Editor, text: string): Slice | null {
  const json = editor.markdown?.parse(text);
  if (!json?.content?.length) return null;
  const doc = editor.schema.nodeFromJSON(json);
  return Slice.maxOpen(doc.content);
}

// VS Code's own clipboard entry: the language of the file the text came from
function vscodeLanguage(event: ClipboardEvent): string | null {
  const data = event.clipboardData?.getData('vscode-editor-data');
  if (!data) return null;
  try {
    const mode = (JSON.parse(data) as { mode?: unknown }).mode;
    return typeof mode === 'string' && mode ? mode : null;
  } catch {
    return null;
  }
}

// what clipboardTextParser returns to leave the text to ProseMirror's own reading
const READ_AS_TEXT = undefined as unknown as Slice;

const inCode = (view: EditorView) => Boolean(view.state.selection.$from.parent.type.spec.code);

function codeBlockSlice(editor: Editor, text: string, language: string): Slice {
  const block: ProseMirrorNode = editor.schema.nodes.codeBlock.create(
    { language: language === 'plaintext' ? null : language },
    text ? editor.schema.text(text) : undefined,
  );
  return new Slice(Fragment.from(block), 0, 0);
}

export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',
  // ahead of TipTap's own clipboard text serializer, which writes plain text
  priority: 1000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          clipboardTextSerializer(slice, view) {
            const { $from, $to } = view.state.selection;
            if ($from.parent.type.spec.code && $from.sameParent($to)) {
              return slice.content.textBetween(0, slice.content.size, '\n');
            }
            const manager = editor.markdown;
            if (!manager) return slice.content.textBetween(0, slice.content.size, '\n\n');
            return manager.serialize({ type: 'doc', content: slice.content.toJSON() ?? [] });
          },

          clipboardTextParser(text, _context, plain, view) {
            // Shift+⌘V, and text pasted into code, stay text
            if (plain || inCode(view) || !looksLikeMarkdown(text)) return READ_AS_TEXT;
            return markdownSlice(editor, text) ?? READ_AS_TEXT;
          },

          handlePaste(view, event) {
            const text = event.clipboardData?.getData('text/plain') ?? '';
            // ProseMirror's own record of Shift+⌘V, which pastes the text as it is
            const plain = (view as unknown as { input?: { shiftKey?: boolean } }).input?.shiftKey;
            if (!text || plain || inCode(view)) return false;

            const language = vscodeLanguage(event);
            if (!language) {
              const html = event.clipboardData?.getData('text/html');
              const preformatted = html ? preformattedLanguage(html) : null;
              if (preformatted === null) return false;
              const markdown = preformatted
                ? isMarkdownLanguage(preformatted)
                : markdownSigns(text) >= 2;
              // anything else is code, which TipTap pastes as a code block
              if (!markdown) return false;
              const slice = markdownSlice(editor, text);
              if (!slice) return false;
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
              return true;
            }

            // a few words of code stay text in the line (TipTap's code block would make any
            // VS Code paste a block, so the text is inserted here)
            if (language !== 'markdown' && !text.includes('\n')) {
              view.dispatch(view.state.tr.insertText(text).scrollIntoView());
              return true;
            }
            const slice = isMarkdownLanguage(language)
              ? markdownSlice(editor, text)
              : codeBlockSlice(editor, text.replace(/\n$/, ''), language);
            if (!slice) return false;
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
