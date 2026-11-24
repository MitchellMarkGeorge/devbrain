import { getSchema, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableKit } from '@tiptap/extension-table';
import { DetailsContent } from '@tiptap/extension-details';
import { highlighter } from '../code-languages';
import { Callout } from '../extensions/callout';
import { EntityLink } from '../extensions/entity-link';
import { ImageLink } from '../extensions/image-link';
import {
  DocumentDetails,
  DocumentDetailsSummary,
  DocumentSubscript,
  DocumentSuperscript,
  DocumentUnderline,
  Kbd,
} from '../extensions/html-elements';
import { RawHtmlBlock, RawHtmlInline } from '../extensions/raw-html';
import { SafeLink } from '../extensions/safe-link';
import { MarkdownCodec, type MarkdownReading } from './codec';
import { DocumentMarkdown } from './extension';
import { DocumentMarkup } from './markup';

export { escapeLineStart, relaxEntities } from './serializer';
export { MarkdownCodec, type MarkdownReading } from './codec';
export { hasMarkup, stripMarkup } from './markup';
export type { Definition, MarkdownSource, SourceBlock, UnmappedReason } from './source';

/**
 * The editor's document model: which markdown it reads and how it writes it back. Every editor in
 * the app is built on these extensions (RichTextEditor adds the UI on top), so a note reads and
 * saves the same wherever it is shown, and `parseMarkdown`/`serializeMarkdown` give the same result
 * without an editor.
 *
 * The format is GitHub-flavoured markdown (docs/editor.md): headings, lists, task lists, tables,
 * code blocks, quotes, strikethrough, links and autolinks; the HTML tags GitHub notes use for the
 * rest (html-elements.ts: underline, keys, sub- and superscript, line breaks, collapsible
 * sections); GitHub's alerts as callouts (callout.ts); and DevBrain's entity links. Other HTML,
 * and images, are kept as written but never rendered (raw-html.ts, image-link.ts).
 *
 * TipTap holds the schema; reading and writing markdown is DevBrain's own (codec.ts, and the rules
 * in rules/), plugged into the editor by DocumentMarkdown (extension.ts).
 */
export function createDocumentExtensions(
  options: {
    entityLink?: AnyExtension;
    imageLink?: AnyExtension;
    callout?: AnyExtension;
    codeBlock?: AnyExtension;
    taskItem?: AnyExtension;
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
    options.taskItem ?? TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false }),
    Table.configure({ resizable: false }),
    // the UI layer passes its own versions, with node views; they keep the same markdown rules
    options.entityLink ?? EntityLink,
    options.imageLink ?? ImageLink,
    options.callout ?? Callout,
    DocumentUnderline,
    Kbd,
    DocumentSubscript,
    DocumentSuperscript,
    DocumentDetails,
    DocumentDetailsSummary,
    DetailsContent,
    RawHtmlBlock,
    RawHtmlInline,
    DocumentMarkup,
    DocumentMarkdown,
  ];
}

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

let codec: MarkdownCodec | null = null;

// the codec for the document's schema, without an editor
function documentCodec(): MarkdownCodec {
  codec ??= new MarkdownCodec(getSchema(createDocumentExtensions()));
  return codec;
}

export function parseMarkdown(markdown: string): JSONContent {
  return documentCodec().parse(markdown);
}

// the document an editor loads for the text, and the text's source map (source.ts)
export function readMarkdown(markdown: string): MarkdownReading {
  return documentCodec().read(markdown);
}

export function serializeMarkdown(doc: JSONContent): string {
  return documentCodec().serialize(doc);
}

// markdown as the editor would save it, unedited
export function normalizeMarkdown(markdown: string): string {
  return serializeMarkdown(parseMarkdown(markdown));
}
