import {
  getSchema,
  mergeAttributes,
  type AnyExtension,
  type Editor,
  type JSONContent,
} from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
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

/**
 * The text a document was read from, block by block: each of its top-level nodes as read, with
 * the slice of the text it came from. Saving with it (`serializeKeeping`) writes the blocks that
 * are unchanged since back as they were written, so a save re-spells only the blocks that were
 * edited (docs/editor.md, "What a save changes").
 */
export interface MarkdownSource {
  text: string;
  // in order: a block's nodes (a token can read as more than one: a list mixing to-dos and
  // bullets), and its slice of `text` without the blank lines around it; an empty paragraph, which
  // stands for an extra blank line, has none
  blocks: { nodes: ProseMirrorNode[]; slice: [number, number] | null }[];
}

// one block as a save writes it: its text and the text before it (the source's own between two
// blocks kept side by side, a blank line elsewhere), the document's children it stands for
// (`from`, with empty paragraphs it takes in; `nodesFrom`, its own), and its slice of the source
// when it is kept from there
interface Piece {
  before: string;
  text: string;
  from: number;
  nodesFrom: number;
  to: number;
  slice?: [number, number];
  // `before` is the source's text between it and the block before it there, which it follows
  joined?: boolean;
}

// how marked reads the text into top-level tokens, as TipTap's manager does in parse()
interface MarkdownLexer {
  lex(text: string): { type: string; raw: string }[];
}

function isEmptyParagraph(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0;
}

function childrenOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  doc.forEach((child) => children.push(child));
  return children;
}

// a token's slice of the text, without the newlines around it
function sliceOf(raw: string, from: number): [number, number] {
  const start = from + (raw.length - raw.replace(/^\n+/, '').length);
  const end = from + raw.replace(/\n+$/, '').length;
  return [start, Math.max(start, end)];
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

  /**
   * Maps `doc`, read from `text`, back to it block by block. Null when the two can't be lined up
   * (then a save writes the whole document in the editor's spelling, as without one): a token
   * that reads as nothing of its own (a link reference definition, which the links using it
   * depend on) or one whose nodes aren't the document's next ones.
   */
  readSource(text: string, doc: ProseMirrorNode): MarkdownSource | null {
    // TipTap's own parse() reads through a lexer of its making, kept for nested tokens; both are
    // private in its types
    const self = this as unknown as {
      createLexer(): MarkdownLexer;
      activeParseLexer: MarkdownLexer | null;
      parseTokens(tokens: unknown[], parseImplicitEmptyParagraphs: boolean): JSONContent[];
    };
    const lexer = self.createLexer();
    const previous = self.activeParseLexer;
    self.activeParseLexer = lexer;
    try {
      const children = childrenOf(doc);
      const blocks: MarkdownSource['blocks'] = [];
      let at = 0;
      let offset = 0;
      for (const token of lexer.lex(text)) {
        const from = offset;
        offset += token.raw.length;
        if (text.slice(from, offset) !== token.raw) return null;
        if (token.type === 'space') continue;
        const nodes = self
          .parseTokens([token], false)
          .map((json) => doc.type.schema.nodeFromJSON(json));
        if (nodes.length === 0) return null;
        const matchesAt = (index: number) =>
          nodes.every((node, k) => children[index + k]?.eq(node) ?? false);
        // the empty paragraphs before it stand for extra blank lines
        while (!matchesAt(at) && at < children.length && isEmptyParagraph(children[at])) {
          blocks.push({ nodes: [children[at++]], slice: null });
        }
        if (!matchesAt(at)) return null;
        blocks.push({
          nodes: children.slice(at, at + nodes.length),
          slice: sliceOf(token.raw, from),
        });
        at += nodes.length;
      }
      while (at < children.length && isEmptyParagraph(children[at])) {
        blocks.push({ nodes: [children[at++]], slice: null });
      }
      // marked reads a text with \r\n line ends as \n: its slices would then be off
      if (offset !== text.length) return null;
      return at === children.length ? { text, blocks } : null;
    } catch {
      return null;
    } finally {
      self.activeParseLexer = previous;
    }
  }

  /**
   * `doc` as markdown, writing each run of blocks unchanged since `source` was read, and still in
   * the same order, as it was written there (the blank lines between them included), and the rest
   * as `serialize` writes it, a blank line between blocks. A whole document unchanged is its text
   * exactly. Where a kept block meets one written anew, the two are read back together, with what
   * is written between them: if they read as anything but the blocks they stand for, the whole
   * document is written as `serialize` writes it instead.
   */
  serializeKeeping(doc: ProseMirrorNode, source: MarkdownSource | null): string {
    const written = () => this.serialize(doc.toJSON());
    if (!source) return written();
    const children = childrenOf(doc);
    const pieces = this.piecesOf(children, source);
    if (!this.seamsReadBack(doc, children, pieces)) return written();
    const markdown = pieces.map((piece) => piece.before + piece.text).join('');
    // a document of nothing but empty paragraphs is written as nothing, as `serialize` does
    return markdown.trim() === '' && markdown !== source.text ? written() : markdown;
  }

  // The document as it is written: a piece per block, in order, with the text before it.
  private piecesOf(children: ProseMirrorNode[], source: MarkdownSource): Piece[] {
    const { text, blocks } = source;
    const matchesAt = (block: number, index: number) =>
      blocks[block].nodes.every((node, k) => children[index + k]?.eq(node) ?? false);
    // each block is kept at most once
    const used = blocks.map(() => false);
    // the block of the source a child is: looked for from the one after the last found, then
    // among the earlier ones not used yet (a block moved up)
    const findBlock = (from: number, index: number) => {
      // an empty paragraph could match any of them: it is only taken where it is expected
      if (isEmptyParagraph(children[index])) {
        return from < blocks.length && !used[from] && matchesAt(from, index) ? from : -1;
      }
      for (let block = from; block < blocks.length; block++) {
        if (!used[block] && matchesAt(block, index)) return block;
      }
      for (let block = 0; block < from; block++) {
        if (!used[block] && matchesAt(block, index)) return block;
      }
      return -1;
    };

    const pieces: Piece[] = [];
    // the last kept block with a slice, while the blocks after it are kept in the source's order:
    // the text between it and the next one is the source's own
    let last: { block: number; piece: Piece } | null = null;
    // children kept since it without a slice of their own (empty paragraphs)
    let emptySince = 0;
    const separator = () => (pieces.length === 0 ? '' : '\n\n');
    const pushEmpty = (index: number) => {
      pieces.push({ before: separator(), text: '', from: index, nodesFrom: index, to: index + 1 });
    };
    let next = 0;
    for (let index = 0; index < children.length; ) {
      const block = findBlock(next, index);
      if (block === -1) {
        // written anew, after the empty paragraphs held back since the last kept block
        for (let k = index - emptySince; k < index; k++) pushEmpty(k);
        last = null;
        emptySince = 0;
        const markdown = this.serialize({ type: 'doc', content: [children[index].toJSON()] });
        pieces.push({
          before: separator(),
          text: markdown,
          from: index,
          nodesFrom: index,
          to: index + 1,
        });
        index += 1;
        continue;
      }
      used[block] = true;
      next = block + 1;
      const end = index + blocks[block].nodes.length;
      const slice = blocks[block].slice;
      const consecutive = last !== null && block === last.block + 1 + emptySince;
      // nothing written yet, and every block so far the text's own, from its start
      const opening = pieces.length === 0 && block === emptySince && index === emptySince;
      if (!slice) {
        // an empty paragraph: within a run of the source it is in the text between two blocks
        if (consecutive || opening) emptySince += 1;
        else {
          last = null;
          emptySince = 0;
          pushEmpty(index);
        }
        index = end;
        continue;
      }
      let before: string;
      let from = index;
      if (consecutive && last) {
        before = text.slice(last.piece.slice![1], slice[0]);
        from = last.piece.to;
      } else if (opening) {
        // the document's first block, after the blank lines it opened with
        before = text.slice(0, slice[0]);
        from = 0;
      } else {
        // the empty paragraphs held back belonged to no run: written as `serialize` does
        for (let k = index - emptySince; k < index; k++) pushEmpty(k);
        before = separator();
      }
      const piece: Piece = {
        joined: consecutive,
        before,
        text: text.slice(slice[0], slice[1]),
        from,
        nodesFrom: index,
        to: end,
        slice,
      };
      pieces.push(piece);
      last = { block, piece };
      emptySince = 0;
      index = end;
    }
    // a text of nothing but blank lines, unchanged
    if (pieces.length === 0 && emptySince === children.length && emptySince === blocks.length) {
      return [{ before: '', text, from: 0, nodesFrom: 0, to: children.length }];
    }
    // the blank lines and newline the text ended with, when its last blocks end the document too
    const lastBlock = blocks.length - 1;
    if (
      last &&
      last.block + emptySince === lastBlock &&
      last.piece.to + emptySince === children.length
    ) {
      last.piece.text += text.slice(last.piece.slice![1]);
      last.piece.to = children.length;
    } else {
      for (let k = children.length - emptySince; k < children.length; k++) pushEmpty(k);
    }
    return pieces;
  }

  // Whether the blocks on each side of every seam read back as themselves: where a kept block
  // meets one written anew, or one kept from elsewhere in the text, the two are read together
  // with what is written between them (blank lines, empty paragraphs). Markdown reads a block by
  // what comes before it (an indented line after a list item continues the item), and the blocks
  // kept side by side as they were read as they did, so only these seams can read differently.
  private seamsReadBack(
    doc: ProseMirrorNode,
    children: ProseMirrorNode[],
    pieces: Piece[],
  ): boolean {
    const solid = pieces.flatMap((piece, index) => (piece.text === '' ? [] : [index]));
    for (let k = 0; k + 1 < solid.length; k++) {
      const left = pieces[solid[k]];
      const right = pieces[solid[k + 1]];
      // written anew on both sides, as `serialize` writes them; or kept side by side, as written
      if (!left.slice && !right.slice) continue;
      if (right.joined) continue;
      const between = pieces
        .slice(solid[k] + 1, solid[k + 1] + 1)
        .map((piece) => piece.before + piece.text)
        .join('');
      const expected = doc.type.schema.topNodeType.create(
        null,
        children.slice(left.nodesFrom, right.to),
      );
      try {
        const reread = doc.type.schema.nodeFromJSON(this.parse(left.text + between));
        if (!reread.eq(expected)) return false;
      } catch {
        return false;
      }
    }
    return true;
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

let manager: DocumentMarkdownManager | null = null;
let schema: Schema | null = null;

function documentManager(): DocumentMarkdownManager {
  if (!manager) {
    const extensions = createDocumentExtensions();
    // the schema binds the extensions, which the manager needs to render and parse
    schema = getSchema(extensions);
    manager = new DocumentMarkdownManager({ extensions, markedOptions: { gfm: true } });
  }
  return manager;
}

function documentSchema(): Schema {
  documentManager();
  return schema!;
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

/**
 * `doc` as it would be saved after reading `text`: the blocks unchanged since written back as they
 * were in `text`, the rest in the editor's spelling (MarkdownSource).
 */
export function serializeKeepingSource(text: string, doc: JSONContent): string {
  const read = documentSchema().nodeFromJSON(parseMarkdown(text));
  const current = documentSchema().nodeFromJSON(doc);
  const manager = documentManager();
  return manager.serializeKeeping(current, manager.readSource(text, read));
}

// the editor's own manager, which every editor made from createDocumentExtensions has
function managerOf(editor: Editor): DocumentMarkdownManager | null {
  return editor.markdown instanceof DocumentMarkdownManager ? editor.markdown : null;
}

/** The editor's document, which it has just loaded from `text`, mapped back to it. */
export function readEditorSource(editor: Editor, text: string): MarkdownSource | null {
  return managerOf(editor)?.readSource(text, editor.state.doc) ?? null;
}

/** The editor's document as markdown, keeping the blocks unchanged since `source` was read. */
export function editorMarkdown(editor: Editor, source: MarkdownSource | null): string {
  const manager = managerOf(editor);
  return manager ? manager.serializeKeeping(editor.state.doc, source) : editor.getMarkdown();
}
