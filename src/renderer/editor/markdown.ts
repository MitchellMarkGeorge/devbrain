import { getSchema, mergeAttributes, type AnyExtension, type JSONContent } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { highlighter } from './code-languages';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem } from '@tiptap/extension-list';
import { Table, TableKit } from '@tiptap/extension-table';
import { Markdown, MarkdownManager, assumeContentType } from '@tiptap/markdown';
import { Marked, type marked } from 'marked';
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
import { DocumentTaskList } from './extensions/task-list';

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
    DocumentTaskList,
    options.taskItem ?? TaskItem.configure({ nested: true }),
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

// the end of a paragraph: an empty line, or one of only spaces (marked's paragraph rule)
const BLANK_LINE = /\n *(?:\n|$)/;

// the source up to the first blank line, as far as the paragraph that starts it can reach
function toBlankLine(src: string): string {
  const blank = BLANK_LINE.exec(src);
  return blank ? src.slice(0, blank.index + blank[0].length) : src;
}

class DocumentMarkdownManager extends MarkdownManager {
  constructor(options: ConstructorParameters<typeof MarkdownManager>[0]) {
    super(options);
    // Before each paragraph marked calls every block extension's `start` on the rest of the note,
    // to cut the paragraph where a block could begin. One that finds nothing searches to the end,
    // so a note took time quadratic in its length. A paragraph ends at a blank line, so a block
    // starting after one can't cut it: each search stops there.
    const starts = this.instance.defaults.extensions?.startBlock;
    starts?.forEach((start, index) => {
      starts[index] = function (src) {
        return start.call(this, toBlankLine(src));
      };
    });
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

/**
 * A marked instance of its own for a manager. TipTap types its `marked` option as the global
 * `marked` (a function with the instance's methods on it), but only uses what an instance has.
 */
export function ownMarked(): typeof marked {
  return new Marked() as unknown as typeof marked;
}

/**
 * Markdown with DocumentMarkdownManager in place of TipTap's own manager, over a marked instance of
 * its own.
 *
 * A MarkdownManager registers every extension's tokenizer on its marked instance with
 * `marked.use()`, and nothing ever removes them. TipTap's manager defaults to marked's shared
 * global instance, so each editor made in the window would add another full set to it and lexing
 * would slow with every editor ever made. Here each editor's manager gets an instance of its own
 * (ownMarked), which goes away with the editor, and only one manager is built per editor:
 * `onBeforeCreate` replaces TipTap's rather than calling it (which would build its stock manager
 * and register them all too).
 */
const DocumentMarkdown = Markdown.extend({
  // TipTap's storage holds a manager with no extensions until the editor is made; this one is over
  // its own instance, so even its `setOptions` leaves the global one alone
  addStorage() {
    return {
      manager: new MarkdownManager({
        indentation: this.options.indentation,
        marked: ownMarked(),
        markedOptions: this.options.markedOptions,
        extensions: [],
      }),
    };
  },
  // mirrors @tiptap/markdown's Markdown.onBeforeCreate (3.x): set `editor.markdown` and
  // `editor.getMarkdown`, and when `contentType` is markdown parse a string `content` into JSON
  onBeforeCreate() {
    if (this.editor.markdown) {
      console.error(
        '[tiptap][markdown]: There is already a `markdown` property on the editor instance. This might lead to unexpected behavior.',
      );
      return;
    }
    const manager = new DocumentMarkdownManager({
      indentation: this.options.indentation,
      marked: this.options.marked ?? ownMarked(),
      markedOptions: this.options.markedOptions,
      extensions: this.editor.extensionManager.baseExtensions,
    });
    this.storage.manager = manager;
    this.editor.markdown = manager;
    this.editor.getMarkdown = () => manager.serialize(this.editor.getJSON());

    const { content, contentType } = this.editor.options;
    if (!contentType || assumeContentType(content, contentType) !== 'markdown') return;
    if (typeof content !== 'string') {
      throw new Error(
        '[tiptap][markdown]: The `contentType` option is set to "markdown", but the initial content is not a string. Please provide the initial content as a markdown string.',
      );
    }
    const json = manager.parse(content);
    if (json.content?.length) this.editor.options.content = json;
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
    // its own marked instance, like an editor's (DocumentMarkdown), not marked's global one
    manager = new DocumentMarkdownManager({
      extensions,
      marked: ownMarked(),
      markedOptions: { gfm: true },
    });
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
