import { getSchema, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableKit } from '@tiptap/extension-table';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
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
 * sections); and DevBrain's entity links. Other HTML, and images, are kept as written but never
 * rendered (raw-html.ts, image-link.ts).
 */
export function createDocumentExtensions(
  options: { entityLink?: AnyExtension; imageLink?: AnyExtension } = {},
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
    DocumentCodeBlock,
    SafeLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false }),
    DocumentTable.configure({ resizable: false }),
    // the UI layer passes its own versions, with node views; they keep the same markdown rules
    options.entityLink ?? EntityLink,
    options.imageLink ?? ImageLink,
    DocumentUnderline,
    Kbd,
    DocumentSubscript,
    DocumentSuperscript,
    HtmlBreak,
    DocumentDetails,
    DocumentDetailsSummary,
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

type TextEncoder = (text: string, node: JSONContent, parentNode?: JSONContent) => string;

class DocumentMarkdownManager extends MarkdownManager {
  constructor(options: ConstructorParameters<typeof MarkdownManager>[0]) {
    super(options);
    // encodeTextForMarkdown is private in TipTap's types; wrapping it is the one change made
    const self = this as unknown as { encodeTextForMarkdown: TextEncoder };
    const encode = self.encodeTextForMarkdown.bind(this);
    self.encodeTextForMarkdown = (text, node, parentNode) => {
      const encoded = encode(text, node, parentNode);
      // unchanged inside code, where nothing is encoded
      return encoded === text ? encoded : relaxEntities(encoded);
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

// a code block's `pre` carries its language, which EditorContent shows as a label
const DocumentCodeBlock = CodeBlock.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language: string | null = node.attrs.language || null;
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-language': language }),
      ['code', { class: language ? this.options.languageClassPrefix + language : null }, 0],
    ];
  },
});

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
