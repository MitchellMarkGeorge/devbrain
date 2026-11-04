import { getSchema, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { highlighter } from './code-languages';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableKit } from '@tiptap/extension-table';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import { Callout } from './extensions/callout';
import { EntityLink } from './extensions/entity-link';
import { ImageLink } from './extensions/image-link';
import { DetailsContent } from '@tiptap/extension-details';
import {
  DocumentDetails,
  DocumentDetailsSummary,
  DocumentSubscript,
  DocumentSuperscript,
  DocumentUnderline,
  HtmlBreak,
  Kbd,
} from './extensions/html-elements';
import { RawHtmlBlock, RawHtmlInline } from './extensions/raw-html';
import { SafeLink } from './extensions/safe-link';

/**
 * The editor's document model: which markdown it reads and how it writes it back. Every editor in
 * the app is built on these extensions (RichTextEditor adds the UI on top), so a note reads and
 * saves the same wherever it is shown, and `parseMarkdown`/`serializeMarkdown` give the same result
 * without an editor.
 *
 * The format is GitHub-flavoured markdown (docs/editor.md): headings, lists, task lists, tables,
 * code blocks, quotes, strikethrough, links and autolinks; the HTML tags GitHub notes use for the
 * rest (html-elements.ts: underline, keys, sub- and superscript, line breaks, collapsible
 * sections); GitHub's alerts as callouts (callout.ts); and DevBrain's entity links. Other HTML, and images, are kept as written but never
 * rendered (raw-html.ts, image-link.ts).
 */
export function createDocumentExtensions(
  options: {
    entityLink?: AnyExtension;
    imageLink?: AnyExtension;
    callout?: AnyExtension;
    codeBlock?: AnyExtension;
  } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      link: false,
      // with its input rule, from html-elements.ts
      underline: false,
      codeBlock: false,
      // the empty paragraph it adds after a final table or code block would be written to the file
      trailingNode: false,
    }),
    options.codeBlock ?? DocumentCodeBlock,
    SafeLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false }),
    DocumentTable.configure({ resizable: false }),
    // the UI layer passes its own versions, with node views; they keep the same markdown rules
    options.entityLink ?? EntityLink,
    options.imageLink ?? ImageLink,
    options.callout ?? Callout,
    DocumentUnderline,
    Kbd,
    DocumentSubscript,
    DocumentSuperscript,
    HtmlBreak,
    DocumentDetails,
    DocumentDetailsSummary,
    DetailsContent,
    RawHtmlBlock,
    RawHtmlInline,
    DocumentMarkdown.configure({ markedOptions: { gfm: true } }),
  ];
}

/**
 * TipTap's serializer writes every `&`, `<` and `>` in text as an HTML entity, so "A & B" would be
 * saved as "A &amp; B". This keeps an entity only where the character could be read back as markup:
 * `&` before something that looks like an entity, `<` before a tag-like character, and `>` at the
 * start of a text (where it could start a quote, written `\>`).
 */
export function relaxEntities(text: string): string {
  return text
    .replace(/&amp;(?![A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#[xX][0-9A-Fa-f]+;)/g, '&')
    .replace(/&lt;(?![A-Za-z/!?])/g, '<')
    .replace(/^&gt;/, '\\>')
    .replace(/&gt;/g, '>');
}

/**
 * A paragraph's text that starts a line with what markdown reads as a block, escaped so it stays
 * text: "## Not a heading", "- not a list", "1. not a list" are written `\## Not a heading`,
 * `\- not a list`, `1\. not a list`. (`>` is escaped by relaxEntities, `*` and `_` always.)
 */
export function escapeLineStart(text: string): string {
  return text
    .replace(/^(#{1,6})(?=[ \t]|$)/, '\\$1')
    .replace(/^([-+])(?=[ \t])/, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=[ \t]|$)/, '$1\\$2');
}

type TextEncoder = (text: string, node: JSONContent, parentNode?: JSONContent) => string;

function isCode(node: JSONContent, parentNode?: JSONContent): boolean {
  return (
    parentNode?.type === 'codeBlock' ||
    (node.marks ?? []).some((mark) => (typeof mark === 'string' ? mark : mark.type) === 'code')
  );
}

// whether this text starts a line of its paragraph: its first child, or the one after a line break
function startsParagraphLine(node: JSONContent, parentNode?: JSONContent): boolean {
  if (parentNode?.type !== 'paragraph' || !parentNode.content) return false;
  const index = parentNode.content.indexOf(node);
  return index === 0 || parentNode.content[index - 1]?.type === 'hardBreak';
}

class DocumentMarkdownManager extends MarkdownManager {
  constructor(options: ConstructorParameters<typeof MarkdownManager>[0]) {
    super(options);
    // encodeTextForMarkdown is private in TipTap's types; wrapping it is the one change made
    const self = this as unknown as { encodeTextForMarkdown: TextEncoder };
    const encode = self.encodeTextForMarkdown.bind(this);
    self.encodeTextForMarkdown = (text, node, parentNode) => {
      const encoded = encode(text, node, parentNode);
      // inside code nothing is encoded, and nothing reads as markup
      if (isCode(node, parentNode)) return encoded;
      const relaxed = relaxEntities(encoded);
      return startsParagraphLine(node, parentNode) ? escapeLineStart(relaxed) : relaxed;
    };
  }
}

// Markdown with DocumentMarkdownManager in place of TipTap's own manager
const DocumentMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    const manager = new DocumentMarkdownManager({
      indentation: this.options.indentation,
      marked: this.options.marked,
      markedOptions: this.options.markedOptions,
      extensions: this.editor.extensionManager.baseExtensions,
    });
    this.storage.manager = manager;
    this.editor.markdown = manager;
  },
});

// a code block, highlighted in its language (code-languages.ts); its `pre` carries the language,
// which EditorContent shows as a label where the CodeBlock component doesn't draw it
export const DocumentCodeBlock = CodeBlockLowlight.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language: string | null = node.attrs.language || null;
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-language': language }),
      ['code', { class: language ? this.options.languageClassPrefix + language : null }, 0],
    ];
  },
}).configure({ lowlight: highlighter });

// TipTap's table writes a blank line before and after itself on top of the one between blocks
const DocumentTable = Table.extend({
  renderMarkdown(node, helpers, ctx) {
    return (this.parent?.(node, helpers, ctx) ?? '').replace(/^\n+|\n+$/g, '');
  },
});

let manager: MarkdownManager | null = null;

function documentManager(): MarkdownManager {
  if (!manager) {
    const extensions = createDocumentExtensions();
    // the schema binds the extensions, which the manager needs to render and parse
    getSchema(extensions);
    manager = new DocumentMarkdownManager({ extensions, markedOptions: { gfm: true } });
  }
  return manager;
}

export function parseMarkdown(markdown: string): JSONContent {
  return documentManager().parse(markdown);
}

export function serializeMarkdown(doc: JSONContent): string {
  return documentManager().serialize(doc);
}

// markdown as the editor would save it, unedited
export function normalizeMarkdown(markdown: string): string {
  return serializeMarkdown(parseMarkdown(markdown));
}
