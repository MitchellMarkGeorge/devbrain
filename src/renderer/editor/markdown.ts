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
  // the text as read, with \n line ends: `crlf` when it was written with \r\n
  text: string;
  crlf: boolean;
  // in order: a block's nodes (a token can read as more than one: a list mixing to-dos and
  // bullets), and its slice of `text` without the blank lines around it; an empty paragraph, which
  // stands for an extra blank line, has none
  blocks: { nodes: ProseMirrorNode[]; slice: [number, number] | null }[];
  // its link reference definitions (`[docs]: https://…`), which read as no block: each is kept
  // with the text between two kept blocks around it, and written at the end of the text when a
  // save leaves that text out, so the kept links that use it still read as links
  definitions: Definition[];
}

// a link reference definition: its slice of the text, its label as marked keys it, what it
// defines, and whether it is the label's first (marked ignores the ones after it)
interface Definition {
  range: [number, number];
  label: string;
  href: string;
  title: string | null;
  first: boolean;
}

// whether a link could use `label`: written in brackets outside the definitions (a rough test,
// which may see a use where there is none, never the other way round)
function labelUsed(text: string, label: string, definitions: Definition[]): boolean {
  let rest = '';
  let at = 0;
  for (const { range } of definitions) {
    rest += text.slice(at, range[0]);
    at = range[1];
  }
  rest += text.slice(at);
  return rest.toLowerCase().replace(/\s+/g, ' ').includes(`[${label}]`);
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
  // the source's text it writes besides its slice: the text before it there, and after it when
  // it ends the text as it did
  copied?: [number, number][];
  // written anew with the text's own text before the first block, or after the last (`edge`): read
  // back with it
  edge?: 'start' | 'end';
}

// how marked reads the text into top-level tokens, as TipTap's manager does in parse()
interface MarkdownLexer {
  lex(text: string): { type: string; raw: string }[];
}

function isEmptyParagraph(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0;
}

/**
 * The top-level nodes TipTap's parser gave, as the editor holds them. The parser gives inline
 * nodes on their own where a paragraph holds nothing else (`![diagram](diagram.png)` is a bare
 * image), and loading them into the editor wraps each run of them in a paragraph; this does the
 * same, so what is read compares equal to the editor's document.
 */
function blocksFromJSON(schema: Schema, content: JSONContent[]): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  let inline: ProseMirrorNode[] = [];
  const flush = () => {
    if (inline.length > 0) blocks.push(schema.nodes.paragraph.create(null, inline));
    inline = [];
  };
  for (const json of content) {
    const node = schema.nodeFromJSON(json);
    if (node.isInline) inline.push(node);
    else {
      flush();
      blocks.push(node);
    }
  }
  flush();
  return blocks;
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

// `markdown` ending with a newline when `text` did, unless the document ends with an empty
// paragraph (which stands for a blank line) or nothing is written
function withFinalNewline(markdown: string, text: string, children: ProseMirrorNode[]): string {
  const last = children[children.length - 1];
  if (!text.endsWith('\n') || markdown === '' || markdown.endsWith('\n')) return markdown;
  return last && !isEmptyParagraph(last) ? markdown + '\n' : markdown;
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
  readSource(stored: string, doc: ProseMirrorNode): MarkdownSource | null {
    // marked reads \r\n as \n, so a text written with \r\n throughout is mapped as \n and
    // written back with \r\n; one that mixes them is not mapped
    const crlf = stored.includes('\r\n');
    const text = crlf ? stored.replace(/\r\n/g, '\n') : stored;
    if (text.includes('\r') || (crlf && /(^|[^\r])\n/.test(stored))) return null;
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
      const definitions: Definition[] = [];
      const tokens = lexer.lex(text);
      let at = 0;
      let offset = 0;
      for (const token of tokens) {
        // marked drops a definition of a label already defined, raw text and all
        if (!text.startsWith(token.raw, offset)) {
          const skipped = this.droppedDefinitions(text, offset, token.raw);
          if (!skipped) return null;
          definitions.push(...skipped);
          offset = text.indexOf(token.raw, offset);
        }
        const from = offset;
        offset += token.raw.length;
        if (token.type === 'space') continue;
        if (token.type === 'def') {
          // read as no block: kept in the text between the blocks around it (MarkdownSource)
          const def = token as unknown as { tag: string; href: string; title?: string | null };
          definitions.push({
            range: sliceOf(token.raw, from),
            label: def.tag,
            href: def.href,
            title: def.title ?? null,
            first: true,
          });
          continue;
        }
        const nodes = blocksFromJSON(doc.type.schema, self.parseTokens([token], false));
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
      if (offset !== text.length || at !== children.length) return null;
      // every label is defined at the top level (one in a quote or a list item would go with it
      // when that block is rewritten), and its later definitions, which marked ignores, either
      // agree with the first or are never used
      const links = (tokens as { links?: Record<string, unknown> }).links ?? {};
      const labels = new Set(definitions.filter((d) => d.first).map((d) => d.label));
      if (Object.keys(links).some((label) => !labels.has(label))) return null;
      for (const later of definitions.filter((d) => !d.first)) {
        const first = definitions.find((d) => d.first && d.label === later.label);
        const agrees = first && first.href === later.href && first.title === later.title;
        if (!agrees && labelUsed(text, later.label, definitions)) return null;
      }
      return { text, crlf, blocks, definitions };
    } catch {
      return null;
    } finally {
      self.activeParseLexer = previous;
    }
  }

  // The definitions marked dropped between `offset` and the next token, `raw`, each repeating a
  // label defined before it; null when that text is anything else.
  private droppedDefinitions(text: string, offset: number, raw: string): Definition[] | null {
    const next = text.indexOf(raw, offset);
    if (next === -1) return null;
    const found: Definition[] = [];
    let at = offset;
    // read on its own, the text gives each label's first definition again, and drops its repeats
    // in turn: read again from where it dropped one
    while (at < next) {
      const lexer = (this as unknown as { createLexer(): MarkdownLexer }).createLexer();
      const start = at;
      for (const token of lexer.lex(text.slice(at, next))) {
        if (!text.startsWith(token.raw, at)) break;
        if (token.type === 'def') {
          const def = token as unknown as { tag: string; href: string; title?: string | null };
          const range = sliceOf(token.raw, at);
          found.push({
            range,
            label: def.tag,
            href: def.href,
            title: def.title ?? null,
            first: false,
          });
        } else if (token.type !== 'space') return null;
        at += token.raw.length;
      }
      if (at === start) return null;
    }
    return found.length > 0 ? found : null;
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
    if (!source) return this.serialize(doc.toJSON());
    const children = childrenOf(doc);
    const lineEnds = (markdown: string) =>
      source.crlf ? markdown.replace(/\n/g, '\r\n') : markdown;
    // the text's final newline, which `serialize` never writes, is kept when the document no
    // longer ends with the block it followed (a newline after the last block reads as nothing);
    // `serialize` writes every link in full, so it needs none of the definitions
    const written = () =>
      lineEnds(withFinalNewline(this.serialize(doc.toJSON()), source.text, children));
    // the text around a block rewritten in place first, then a blank line
    const markdown =
      this.keeping(doc, children, source, true) ?? this.keeping(doc, children, source, false);
    return markdown === null ? written() : lineEnds(markdown);
  }

  // `doc` written keeping what it can of `source` (serializeKeeping), or null when the blocks
  // would not read back as they are
  private keeping(
    doc: ProseMirrorNode,
    children: ProseMirrorNode[],
    source: MarkdownSource,
    inPlace: boolean,
  ): string | null {
    const pieces = this.piecesOf(children, source, inPlace);
    const { text, definitions } = source;
    const definitionText = (list: Definition[]) =>
      list.map((d) => text.slice(...d.range)).join('\n');
    // The kept blocks' links read through the text's definitions, wherever they are written: a
    // seam is read with those of the labels it doesn't define itself after it (a label defined
    // again is ignored, and the blank line before it then reads as an empty paragraph).
    // (only those it could use: its labels in brackets)
    const definitionsFor = (markdown: string) => {
      if (definitions.length === 0) return '';
      const words = markdown.toLowerCase().replace(/\s+/g, ' ');
      return definitionText(
        definitions.filter(
          (d) =>
            d.first &&
            words.includes(`[${d.label}]`) &&
            !definitions.some(
              (o) => o.label === d.label && markdown.includes(text.slice(...o.range)),
            ),
        ),
      );
    };
    if (!this.seamsReadBack(doc, children, pieces, definitionsFor)) return null;
    let markdown = pieces.map((piece) => piece.before + piece.text).join('');
    // a document of nothing but empty paragraphs is written as nothing, as `serialize` does
    if (markdown.trim() === '') return markdown === source.text ? markdown : null;
    // the definitions in text the save left out, at the end, where they still read as definitions
    const copied = pieces.flatMap((piece) => piece.copied ?? []);
    const written = (d: Definition) =>
      copied.some(([from, to]) => from <= d.range[0] && d.range[1] <= to);
    const missing = definitions.filter(
      (d) => d.first && !definitions.some((o) => o.label === d.label && written(o)),
    );
    if (missing.length > 0) {
      const appended = definitionText(missing);
      const separator = markdown.endsWith('\n\n') ? '' : markdown.endsWith('\n') ? '\n' : '\n\n';
      // the blocks they follow must still read as they are
      let last = pieces.length - 1;
      while (last > 0 && pieces[last].text === '') last -= 1;
      const tail = pieces
        .slice(last)
        .map((piece, k) => (k === 0 ? '' : piece.before) + piece.text)
        .join('');
      const expected = doc.type.schema.topNodeType.create(
        null,
        children.slice(pieces[last].nodesFrom),
      );
      const reread = this.parseDocument(doc.type.schema, tail + separator + appended);
      if (!reread.eq(expected)) return null;
      markdown += separator + appended;
    }
    return withFinalNewline(markdown, source.text, children);
  }

  /** `text` read as the editor would hold it. */
  parseDocument(schema: Schema, text: string): ProseMirrorNode {
    return schema.topNodeType.create(null, blocksFromJSON(schema, this.parse(text).content ?? []));
  }

  // The document as it is written: a piece per block, in order, with the text before it.
  // With `inPlace`, a block written anew where the text had another, between two kept blocks or
  // beside one, is written with the text's own text around it there (`# Title` straight above a
  // list stays so when the list changes); without it, a blank line.
  private piecesOf(children: ProseMirrorNode[], source: MarkdownSource, inPlace: boolean): Piece[] {
    const { text, blocks } = source;
    const matchesAt = (block: number, index: number) =>
      blocks[block].nodes.every((node, k) => children[index + k]?.eq(node) ?? false);
    // each block is kept at most once
    const used = blocks.map(() => false);
    // the block of the source a child is: looked for from the one after the last found, then
    // among the earlier ones not used yet (a block moved up)
    // (`ahead`: the children written anew since the last found, which may stand in for blocks)
    const findBlock = (from: number, index: number, ahead: number) => {
      // an empty paragraph could match any of them: it is only taken where it is expected, after
      // the last block found, or after as many more as were written anew since (`[](#top)`, a
      // link with no text, reads as one)
      if (isEmptyParagraph(children[index])) {
        for (const block of new Set([from, from + ahead])) {
          if (block < blocks.length && !used[block] && matchesAt(block, index)) return block;
        }
        return -1;
      }
      for (let block = from; block < blocks.length; block++) {
        if (!used[block] && matchesAt(block, index)) return block;
      }
      for (let block = 0; block < from; block++) {
        if (!used[block] && matchesAt(block, index)) return block;
      }
      return -1;
    };

    // which block each child starting one is, or -1 for one written anew
    const assigned: number[] = [];
    for (let index = 0, next = 0, ahead = 0; index < children.length; ) {
      const block = findBlock(next, index, ahead);
      assigned[index] = block;
      if (block === -1) {
        index += 1;
        ahead += 1;
        continue;
      }
      used[block] = true;
      next = block + 1;
      ahead = 0;
      index += blocks[block].nodes.length;
    }
    // the text between a block of the source and the next, when that is a block (not an extra
    // blank line) not kept
    // (or, for a block put in between two kept, the text between those, `index` the next child)
    const gapAfter = (block: number, index: number): [number, number] | null => {
      const following = blocks[block + 1];
      const between = assigned[index] === block + 1;
      if (!inPlace || !following?.slice || (used[block + 1] && !between)) return null;
      return [blocks[block].slice![1], following.slice[0]];
    };
    const gapBefore = (block: number): [number, number] | null => {
      const preceding = blocks[block - 1];
      if (!inPlace || !preceding?.slice || used[block - 1]) return null;
      return [preceding.slice[1], blocks[block].slice![0]];
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
    for (let index = 0; index < children.length; ) {
      const block = assigned[index];
      if (block === -1) {
        // written anew, after the empty paragraphs held back since the last kept block: straight
        // after a kept block, in the place of the block that followed it, with the text between
        // (an empty paragraph is a blank line, with no text around it of its own)
        const empty = isEmptyParagraph(children[index]);
        let gap = last && emptySince === 0 && !empty ? gapAfter(last.block, index + 1) : null;
        // or first, in the place of the text's first block, after the text before that
        const first = inPlace && !empty && index === 0 && blocks[0]?.slice && !used[0];
        if (first) gap = [0, blocks[0].slice![0]];
        for (let k = index - emptySince; k < index; k++) pushEmpty(k);
        last = null;
        emptySince = 0;
        const markdown = this.serialize({ type: 'doc', content: [children[index].toJSON()] });
        pieces.push({
          before: gap ? text.slice(...gap) : separator(),
          text: markdown,
          from: index,
          nodesFrom: index,
          to: index + 1,
          copied: gap ? [gap] : [],
          edge: first ? 'start' : undefined,
        });
        index += 1;
        continue;
      }
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
      let copied: [number, number] | null = null;
      if (consecutive && last) {
        copied = [last.piece.slice![1], slice[0]];
        before = text.slice(...copied);
        from = last.piece.to;
      } else if (opening) {
        // the document's first block, after the blank lines it opened with
        copied = [0, slice[0]];
        before = text.slice(...copied);
        from = 0;
      } else {
        // the empty paragraphs held back belonged to no run: written as `serialize` does
        for (let k = index - emptySince; k < index; k++) pushEmpty(k);
        // straight after a block written anew in the place of the one before it in the text
        const previous = pieces[pieces.length - 1];
        const gap = emptySince === 0 && previous && !previous.slice && previous.text !== '';
        copied = gap ? gapBefore(block) : null;
        before = copied ? text.slice(...copied) : separator();
      }
      const piece: Piece = {
        joined: consecutive,
        before,
        text: text.slice(slice[0], slice[1]),
        from,
        nodesFrom: index,
        to: end,
        slice,
        copied: copied ? [copied] : [],
      };
      pieces.push(piece);
      last = { block, piece };
      emptySince = 0;
      index = end;
    }
    // a text of nothing but blank lines, unchanged
    if (pieces.length === 0 && emptySince === children.length && emptySince === blocks.length) {
      return [
        {
          before: '',
          text,
          from: 0,
          nodesFrom: 0,
          to: children.length,
          copied: [[0, text.length]],
        },
      ];
    }
    // the blank lines and newline the text ended with, when its last blocks end the document too
    const lastBlock = blocks.length - 1;
    if (
      last &&
      last.block + emptySince === lastBlock &&
      last.piece.to + emptySince === children.length
    ) {
      last.piece.text += text.slice(last.piece.slice![1]);
      last.piece.copied!.push([last.piece.slice![1], text.length]);
      last.piece.to = children.length;
    } else {
      for (let k = children.length - emptySince; k < children.length; k++) pushEmpty(k);
      // the last block written anew in the place of the text's last: the text after that
      const final = pieces[pieces.length - 1];
      const replaced = blocks[lastBlock];
      if (
        inPlace &&
        final &&
        !final.slice &&
        final.text !== '' &&
        final.to === children.length &&
        replaced?.slice &&
        !used[lastBlock]
      ) {
        final.text += text.slice(replaced.slice[1]);
        final.copied = [...(final.copied ?? []), [replaced.slice[1], text.length]];
        final.edge = final.edge === 'start' ? 'start' : 'end';
      }
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
    definitionsFor: (markdown: string) => string,
  ): boolean {
    // whether `written` reads as the children from `from` to `to`
    const readsAs = (written: string, from: number, to: number) => {
      const expected = doc.type.schema.topNodeType.create(null, children.slice(from, to));
      try {
        const definitions = definitionsFor(written);
        const read = definitions ? written + '\n\n' + definitions : written;
        return this.parseDocument(doc.type.schema, read).eq(expected);
      } catch {
        return false;
      }
    };
    const textOf = (list: Piece[]) => list.map((piece) => piece.before + piece.text).join('');
    for (const piece of pieces) {
      // (the text before one at the end is read at its seam)
      const written = piece.edge === 'start' ? piece.before + piece.text : piece.text;
      if (piece.edge && !readsAs(written, piece.nodesFrom, piece.to)) return false;
    }
    const solid = pieces.flatMap((piece, index) => (piece.text === '' ? [] : [index]));
    for (let k = 0; k + 1 < solid.length; k++) {
      const left = pieces[solid[k]];
      const right = pieces[solid[k + 1]];
      // written anew on both sides, as `serialize` writes them; or kept side by side, as written
      if (!left.slice && !right.slice) continue;
      if (right.joined) continue;
      const between = textOf(pieces.slice(solid[k] + 1, solid[k + 1] + 1));
      if (!readsAs(left.text + between, left.nodesFrom, right.to)) return false;
    }
    if (solid.length === 0) return true;
    // the empty paragraphs the document opens or ends with, written as blank lines
    const first = pieces[solid[0]];
    const last = pieces[solid[solid.length - 1]];
    if (solid[0] > 0 && !readsAs(textOf(pieces.slice(0, solid[0] + 1)), 0, first.to)) {
      return false;
    }
    const after = pieces.slice(solid[solid.length - 1] + 1);
    return (
      after.length === 0 || readsAs(last.text + textOf(after), last.nodesFrom, children.length)
    );
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

// markdown read as the editor holds it
export function parseMarkdown(markdown: string): JSONContent {
  return documentManager().parseDocument(documentSchema(), markdown).toJSON();
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
  const manager = documentManager();
  const read = manager.parseDocument(documentSchema(), text);
  const current = documentSchema().nodeFromJSON(doc);
  return manager.serializeKeeping(current, manager.readSource(text, read));
}

/**
 * Each top-level node `text` reads as, with its slice of the text (with \n line ends); null for
 * an empty paragraph, or for all of them when the text has no map (MarkdownSource).
 */
export function markdownBlocks(text: string): ([number, number] | null)[] | null {
  const manager = documentManager();
  const source = manager.readSource(text, manager.parseDocument(documentSchema(), text));
  return source
    ? source.blocks.flatMap((block) =>
        block.nodes.map(() => (block.nodes.length === 1 ? block.slice : null)),
      )
    : null;
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
