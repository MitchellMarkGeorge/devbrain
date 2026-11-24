import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { hasMarkup, stripMarkup } from './markup';
import type { MarkdownSource, SourceBlock } from './source';

/**
 * Writing a document keeping the text it was read from (docs/editor.md, "What a save changes"):
 * each top-level block that is still as it was read is written back as its slice of the source,
 * with the text that stood between it and its neighbours, and only the rest is written anew, in
 * the editor's spelling.
 *
 * Kept text is never allowed to change what the document reads as. What is written is read back
 * and compared with the document, block for block; when it differs, the text around the new
 * blocks is given up for a blank line, and when it still differs the whole document is written
 * in the editor's spelling, as if there were no source.
 */

/** Why none of the source's text was kept, and the whole document written anew. */
export type WholeReason =
  // the text has no source map (source.ts, `UnmappedReason`): in the editor's spelling
  | 'no-source'
  // no block is still as it was read: each written with the markers it was read with
  | 'nothing-kept'
  // what keeping wrote read back as another document: in the editor's spelling
  | 'readback-mismatch';

export interface KeptWriting {
  markdown: string;
  // null when blocks were kept
  whole: WholeReason | null;
}

/** What keeping needs of the codec: the editor's spelling of a document, and how a text reads. */
export interface KeepingCodec {
  serialize(doc: JSONContent): string;
  // with each node and mark written with the marker it was read with (markup.ts)
  serializeWithMarkup(doc: JSONContent): string;
  parse(markdown: string): JSONContent;
}

// the most pairs of blocks `diffBlocks` compares in a changed stretch; above it, the stretch is
// written anew without being compared (500 changed blocks against 500 loaded ones)
const MATCH_LIMIT = 250_000;

type Item =
  // a block kept with its slice: `count` children of the document, from `child`
  | { kind: 'slice'; slice: number; block: number; child: number; count: number }
  // an empty paragraph the source read from blank lines
  | { kind: 'blank'; block: number; child: number }
  // a child written anew
  | { kind: 'new'; child: number };

type SliceItem = Extract<Item, { kind: 'slice' }>;

function isEmptyParagraph(node: ProseMirrorNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0;
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

/**
 * A top-level node as the editor holds it once it is in a document of its own: an inline node at
 * the top level (a paragraph that holds only an image reads as the bare image) is wrapped in a
 * paragraph by `setContent`, and left bare as the editor's first content. Both compare equal here.
 */
function asBlock(node: ProseMirrorNode): ProseMirrorNode {
  return node.isInline ? node.type.schema.nodes.paragraph.create(null, node) : node;
}

/**
 * The diff between the blocks the editor holds now and the blocks that were loaded: which of the
 * current blocks are still loaded ones.
 *
 * It is the longest common subsequence of the two lists, the algorithm behind `diff`: the most
 * blocks that are equal (`Node.eq`) and stand in the same order in both. A current block in it is
 * unchanged; one outside it was edited, added or moved. (Of two blocks that swap places only one
 * can be in it, so the other counts as changed.)
 *
 * Returns, for each current block, the index of the loaded block it is, or -1 when it is none.
 *
 *     loaded:   A  B  C  D  E
 *     current:  A  B  X  D  N  E
 *     returns: [0, 1, -1, 3, -1, 4]
 *
 * An edit leaves most blocks alone, so the blocks the two lists start with in common and the
 * ones they end with in common are matched first, each with one comparison. Only the stretch
 * between them (`C D` against `X D N` above) goes through the full algorithm, which compares
 * every pair in it. A stretch of more than `MATCH_LIMIT` pairs is not compared at all: its
 * blocks all count as changed, which is always safe and only keeps less text.
 */
function diffBlocks(current: ProseMirrorNode[], loaded: ProseMirrorNode[]): number[] {
  const loadedIndexOf = current.map(() => -1);

  // the blocks both lists start with
  let commonStart = 0;
  while (
    commonStart < current.length &&
    commonStart < loaded.length &&
    current[commonStart].eq(loaded[commonStart])
  ) {
    loadedIndexOf[commonStart] = commonStart;
    commonStart += 1;
  }

  // the blocks both lists end with: what is left to compare ends before these indexes
  let currentEnd = current.length;
  let loadedEnd = loaded.length;
  while (
    currentEnd > commonStart &&
    loadedEnd > commonStart &&
    current[currentEnd - 1].eq(loaded[loadedEnd - 1])
  ) {
    currentEnd -= 1;
    loadedEnd -= 1;
    loadedIndexOf[currentEnd] = loadedEnd;
  }

  // the changed stretch in the middle of each list
  const currentCount = currentEnd - commonStart;
  const loadedCount = loadedEnd - commonStart;
  if (currentCount === 0 || loadedCount === 0) return loadedIndexOf;
  if (currentCount * loadedCount > MATCH_LIMIT) return loadedIndexOf;

  // The table of the algorithm, filled from the end of the stretch backwards.
  // `longestFrom[currentAt][loadedAt]` is how many blocks the longest common subsequence has
  // when only the current blocks from `currentAt` on and the loaded blocks from `loadedAt` on are
  // looked at (both counted from the start of the stretch); the row and the column past the end
  // stay 0.
  const longestFrom = Array.from(
    { length: currentCount + 1 },
    () => new Uint32Array(loadedCount + 1),
  );
  // `areEqual[currentAt][loadedAt]` is 1 when those two blocks are equal, 0 when not: a cache
  // of the comparisons. Each pair's answer is needed twice, to fill the table and to read the
  // matches off it, and `Node.eq` compares two whole blocks (type, attributes, text, marks), so
  // it is asked once and remembered. The table alone can't stand in for it when reading the
  // matches: `longestFrom[c][l] === longestFrom[c + 1][l + 1] + 1` holds for every equal pair,
  // but for some unequal ones too (X A against A Y, at X and A), which would then be matched.
  // A row is a Uint8Array, a byte a pair and all 0 to begin with: at most `MATCH_LIMIT` bytes.
  const areEqual = Array.from({ length: currentCount }, () => new Uint8Array(loadedCount));
  for (let currentAt = currentCount - 1; currentAt >= 0; currentAt -= 1) {
    for (let loadedAt = loadedCount - 1; loadedAt >= 0; loadedAt -= 1) {
      if (current[commonStart + currentAt].eq(loaded[commonStart + loadedAt])) {
        // equal: they are matched, and the rest of both lists follows
        areEqual[currentAt][loadedAt] = 1;
        longestFrom[currentAt][loadedAt] = longestFrom[currentAt + 1][loadedAt + 1] + 1;
      } else {
        // not equal: the better of leaving out this current block or this loaded one
        longestFrom[currentAt][loadedAt] = Math.max(
          longestFrom[currentAt + 1][loadedAt],
          longestFrom[currentAt][loadedAt + 1],
        );
      }
    }
  }

  // Read the matches off the table, from the start of the stretch: two equal blocks are
  // matched; otherwise step past the block whose leaving out loses nothing.
  let currentAt = 0;
  let loadedAt = 0;
  while (currentAt < currentCount && loadedAt < loadedCount) {
    if (areEqual[currentAt][loadedAt]) {
      loadedIndexOf[commonStart + currentAt] = commonStart + loadedAt;
      currentAt += 1;
      loadedAt += 1;
    } else if (longestFrom[currentAt + 1][loadedAt] >= longestFrom[currentAt][loadedAt + 1]) {
      currentAt += 1;
    } else {
      loadedAt += 1;
    }
  }
  return loadedIndexOf;
}

/** `doc` as markdown, keeping what it can of the text it was read from. */
export function writeKeeping(
  codec: KeepingCodec,
  doc: ProseMirrorNode,
  source: MarkdownSource | null,
): KeptWriting {
  const whole = (reason: WholeReason): KeptWriting => ({
    markdown: codec.serialize(doc.toJSON()),
    whole: reason,
  });
  if (!source) return whole('no-source');
  const writing = new Keeping(codec, doc, source);
  // a text of blank lines alone, still the empty paragraphs it was read as
  if (writing.isBlankSource) return { markdown: source.text, whole: null };
  // every block changed: all written anew, still with the markers they were read with
  if (!writing.keepsAny) return { markdown: writing.writeAnew(), whole: 'nothing-kept' };
  // The source's own text around a block written anew first, then a blank line; and the new
  // blocks with the markers they were read with first, then in the editor's spelling (two
  // `*` lists side by side read as one, a `*` list after a `-` list as another).
  const attempts = [
    { inPlace: true, markers: true },
    { inPlace: false, markers: true },
    { inPlace: false, markers: false },
  ];
  const tried = new Set<string>();
  for (const attempt of attempts) {
    const written = writing.write(attempt.inPlace, attempt.markers);
    if (tried.has(written.markdown)) continue;
    tried.add(written.markdown);
    if (writing.readsAs(written.markdown, written.expected)) {
      return { markdown: written.markdown, whole: null };
    }
  }
  return whole('readback-mismatch');
}

class Keeping {
  private readonly children: ProseMirrorNode[];
  private readonly items: Item[];
  private readonly slices: SourceBlock[];
  // the source's text before its first slice, and after its last, is the document's too
  private readonly headKept: boolean;
  private readonly tailKept: boolean;
  // the slice items that follow the one before them as they did in the source
  private readonly linked = new Set<SliceItem>();

  private readonly schema: Schema;

  constructor(
    private readonly codec: KeepingCodec,
    doc: ProseMirrorNode,
    private readonly source: MarkdownSource,
  ) {
    this.schema = doc.type.schema;
    this.children = doc.children.map(asBlock);
    this.slices = source.blocks.filter((block): block is SourceBlock => block !== null);
    this.items = this.match();
    const sliceItems = this.items.filter((item): item is SliceItem => item.kind === 'slice');

    // Two kept blocks that were neighbours in the source, with nothing between them in the
    // document but the empty paragraphs read from the blank lines between them there, are
    // written as one stretch of the source. So are the blank lines before the first block and
    // after the last.
    const blanksOnly = (from: number, to: number) =>
      this.items.slice(from, to).every((item) => item.kind === 'blank');
    const absorbed = new Set<Item>();
    const absorb = (from: number, to: number) =>
      this.items.slice(from, to).forEach((item) => absorbed.add(item));
    sliceItems.forEach((item, index) => {
      const previous = sliceItems[index - 1];
      if (!previous || item.slice !== previous.slice + 1) return;
      const from = this.items.indexOf(previous) + 1;
      const to = this.items.indexOf(item);
      if (to - from !== item.block - previous.block - 1 || !blanksOnly(from, to)) return;
      this.linked.add(item);
      absorb(from, to);
    });
    const first = sliceItems[0];
    const last = sliceItems.at(-1);
    const firstAt = first ? this.items.indexOf(first) : -1;
    const lastAt = last ? this.items.indexOf(last) : -1;
    this.headKept = first?.slice === 0 && firstAt === first.block && blanksOnly(0, firstAt);
    this.tailKept =
      last?.slice === this.slices.length - 1 &&
      this.items.length - 1 - lastAt === source.blocks.length - 1 - last.block &&
      blanksOnly(lastAt + 1, this.items.length);
    if (this.headKept) absorb(0, firstAt);
    if (this.tailKept) absorb(lastAt + 1, this.items.length);
    // an empty paragraph outside those stretches has no text of its own to keep
    this.items = this.items.map((item) =>
      item.kind === 'blank' && !absorbed.has(item) ? { kind: 'new', child: item.child } : item,
    );
  }

  get isBlankSource(): boolean {
    return (
      this.slices.length === 0 &&
      this.items.length === this.source.blocks.length &&
      this.items.every(
        (item) => item.kind !== 'slice' && isEmptyParagraph(this.children[item.child]),
      )
    );
  }

  get keepsAny(): boolean {
    return this.items.some((item) => item.kind === 'slice');
  }

  // each child of the document as the block of the source it still is, or as new
  private match(): Item[] {
    const { blocks } = this.source;
    const empty = this.schema.nodes.paragraph.create();
    // the source's blocks node by node
    const entries: { node: ProseMirrorNode; block: number }[] = [];
    blocks.forEach((block, index) => {
      if (block) block.nodes.forEach((node) => entries.push({ node: asBlock(node), block: index }));
      else entries.push({ node: empty, block: index });
    });
    // for each child, the index of the entry it still is, or -1
    const matched = diffBlocks(
      this.children,
      entries.map((entry) => entry.node),
    );
    const firstEntry = new Map<number, number>();
    entries.forEach((entry, index) => {
      if (!firstEntry.has(entry.block)) firstEntry.set(entry.block, index);
    });
    const sliceIndex = new Map<number, number>();
    blocks.forEach((block, index) => {
      if (block) sliceIndex.set(index, sliceIndex.size);
    });

    const items: Item[] = [];
    for (let child = 0; child < this.children.length; ) {
      const entry = matched[child];
      const block = entry === -1 ? null : entries[entry].block;
      const read = block === null ? null : blocks[block];
      if (block === null || entry === -1) {
        items.push({ kind: 'new', child });
        child += 1;
      } else if (!read) {
        items.push({ kind: 'blank', block, child });
        child += 1;
      } else {
        // a block read as several nodes (a list split in two) is kept when all of them are
        const count = read.nodes.length;
        const whole =
          entry === firstEntry.get(block) &&
          read.nodes.every((_, k) => matched[child + k] === entry + k);
        if (whole) {
          items.push({ kind: 'slice', slice: sliceIndex.get(block)!, block, child, count });
          child += count;
        } else {
          items.push({ kind: 'new', child });
          child += 1;
        }
      }
    }
    return items;
  }

  /**
   * The document written keeping its stretches of the source, and what that text must read as,
   * block for block (`readsAs`). With `inPlace`, a block written anew where the source had
   * another is given the source's own text around it (`### Notes` straight above a list stays so
   * when the list changes); without, a blank line. With `markers`, a block written anew keeps the
   * markers it was read with (`*` bullets, `__bold__`), where they read as the editor's own
   * spelling of it does; without, it is written in the editor's spelling.
   */
  write(inPlace: boolean, markers: boolean): { markdown: string; expected: ProseMirrorNode[] } {
    const { source, items, slices } = this;
    const { text, between, lineEnd } = source;
    const blankLine = '\n\n';
    const own = (markdown: string) =>
      lineEnd === '\n' ? markdown : markdown.replace(/\n/g, lineEnd);

    let out = '';
    // the `between` texts written, by index, for the definitions that go with them
    const written = new Set<number>();
    const writeBetween = (index: number) => {
      written.add(index);
      return between[index];
    };
    // what the output must read as, block for block
    const expected: ProseMirrorNode[] = [];
    let tailWritten = this.tailKept;

    if (this.headKept) out += writeBetween(0);
    for (let at = 0; at < items.length; ) {
      const item = items[at];
      if (item.kind === 'blank') {
        // inside a kept stretch: its blank lines are in the text between the slices
        expected.push(this.children[item.child]);
        at += 1;
        continue;
      }
      if (item.kind === 'slice') {
        const slice = slices[item.slice];
        if (this.linked.has(item)) out += writeBetween(item.slice);
        else {
          // brought next to the kept block before it by what was removed between them, or
          // first in the document now: the definitions that stood next to either stay there
          const previous = items[at - 1];
          const held = inPlace ? this.definitionsBeside(previous, item) : null;
          if (held !== null) out += writeBetween(held);
          else if (previous?.kind === 'slice') out += own(blankLine);
        }
        out += text.slice(slice.from, slice.to);
        expected.push(...this.children.slice(item.child, item.child + item.count));
        at += 1;
        continue;
      }
      // a run of children written anew, between the kept blocks `left` and `right`
      let end = at;
      while (end < items.length && items[end].kind === 'new') end += 1;
      const run = items.slice(at, end).map((newItem) => this.children[newItem.child]);
      const left = this.sliceBefore(at);
      const right = this.sliceAfter(end);
      const separators = this.separators(run, left, right, inPlace);
      if (separators.leftBetween !== null) out += writeBetween(separators.leftBetween);
      else if (left) out += own(blankLine);
      out += own(this.runMarkdown(run, markers));
      if (separators.rightBetween !== null) {
        out += writeBetween(separators.rightBetween);
        if (!right) tailWritten = true;
      } else if (right) out += own(blankLine);
      expected.push(...this.readAlone(run, markers));
      at = end;
    }
    if (this.tailKept) out += writeBetween(slices.length);
    else if (inPlace && items.at(-1)?.kind === 'slice' && this.definitionsAfterLast()) {
      // the blocks it ended with are gone: the definitions after them stay at the end
      out += writeBetween(slices.length);
      tailWritten = true;
    }

    // the newline the text ended with, where what it ended with was not written
    const last = this.children.at(-1);
    const endsLine = (markdown: string) =>
      /\n$/.test(text) && markdown !== '' && !markdown.endsWith('\n');
    if (!tailWritten && endsLine(out) && last && !isEmptyParagraph(last)) out += lineEnd;
    const withDefinitions = this.withDefinitions(out, written);
    if (withDefinitions !== out) out = withDefinitions + (endsLine(withDefinitions) ? lineEnd : '');
    return { markdown: out, expected };
  }

  /**
   * The whole document written anew, when none of its blocks is as it was read (a note of one
   * paragraph, edited): each block with the markers it was read with where they can stand, the
   * source's line ends, and its final newline.
   */
  writeAnew(): string {
    const { text, lineEnd } = this.source;
    const markdown = this.runMarkdown(this.children, true);
    const last = this.children.at(-1);
    const endsLine = /\n$/.test(text) && markdown !== '' && last && !isEmptyParagraph(last);
    const written = endsLine ? `${markdown}\n` : markdown;
    return lineEnd === '\n' ? written : written.replace(/\n/g, lineEnd);
  }

  // A run of blocks written anew, a blank line between them. With `markers`, each block that
  // was read with markers keeps them where that changes nothing but its spelling.
  private runMarkdown(run: ProseMirrorNode[], markers: boolean): string {
    const content = run.map((node) => (markers ? this.withSafeMarkup(node) : node.toJSON()));
    return markers
      ? this.codec.serializeWithMarkup({ type: 'doc', content })
      : this.codec.serialize({ type: 'doc', content });
  }

  // the blocks already checked for `withSafeMarkup`
  private readonly safeMarkup = new WeakMap<ProseMirrorNode, JSONContent>();

  /**
   * A block as it is written with markers: with the ones it was read with when, written with
   * them, it still reads as the block it is, or at least as the editor's own spelling of it
   * reads (a paragraph being typed ends with a space, which neither reads back); without them
   * otherwise. A marker can read differently where it now stands: `_it_s` is no emphasis,
   * `*it*s` is; an underline under two lines of text makes both the heading.
   */
  private withSafeMarkup(node: ProseMirrorNode): JSONContent {
    const known = this.safeMarkup.get(node);
    if (known) return known;
    const json = node.toJSON() as JSONContent;
    let safe = json;
    if (hasMarkup(json)) {
      const doc = { type: 'doc', content: [json] };
      const marked = this.codec.serializeWithMarkup(doc);
      const plain = this.codec.serialize(doc);
      const readsAsItself = () => {
        const read = this.readPlain(marked);
        return (
          read?.length === 1 && read[0].eq(asBlock(this.schema.nodeFromJSON(stripMarkup(json))))
        );
      };
      if (marked !== plain && !readsAsItself() && !this.readSame(marked, plain)) {
        safe = stripMarkup(json);
      }
    }
    this.safeMarkup.set(node, safe);
    return safe;
  }

  // a text's blocks without the markers they are written with, or null when it can't be read
  private readPlain(markdown: string): ProseMirrorNode[] | null {
    try {
      return (this.codec.parse(markdown).content ?? []).map((node) =>
        asBlock(this.schema.nodeFromJSON(stripMarkup(node))),
      );
    } catch {
      return null;
    }
  }

  // whether two texts read as the same blocks, whatever markers each is written with
  private readSame(a: string, b: string): boolean {
    const [first, second] = [this.readPlain(a), this.readPlain(b)];
    if (!first || !second) return false;
    return first.length === second.length && first.every((node, k) => node.eq(second[k]));
  }

  // The `between` text that holds definitions next to one of two kept blocks that the document
  // brings together (`previous` undefined: next to the block the document now starts with), by
  // index; null when neither does, or blank lines read as paragraphs stand there too.
  private definitionsBeside(previous: Item | undefined, item: SliceItem): number | null {
    const { blocks, between } = this.source;
    if (previous && previous.kind !== 'slice') return null;
    const holds = (index: number) => !isBlank(between[index]);
    if (!previous) return blocks[0] !== null && item.slice > 0 && holds(0) ? 0 : null;
    if (blocks[previous.block + 1] !== null && holds(previous.slice + 1)) return previous.slice + 1;
    return blocks[item.block - 1] !== null && holds(item.slice) ? item.slice : null;
  }

  private definitionsAfterLast(): boolean {
    const { blocks, between } = this.source;
    return blocks.at(-1) !== null && !isBlank(between[this.slices.length]);
  }

  private sliceBefore(at: number): SliceItem | null {
    for (let index = at - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (item.kind === 'slice') return item;
    }
    return null;
  }

  private sliceAfter(at: number): SliceItem | null {
    for (let index = at; index < this.items.length; index += 1) {
      const item = this.items[index];
      if (item.kind === 'slice') return item;
    }
    return null;
  }

  // which of the source's `between` texts go before and after a run written anew, by index; null
  // for a blank line
  private separators(
    run: ProseMirrorNode[],
    left: SliceItem | null,
    right: SliceItem | null,
    inPlace: boolean,
  ): { leftBetween: number | null; rightBetween: number | null } {
    const { blocks, between } = this.source;
    const none = { leftBetween: null, rightBetween: null };
    if (!inPlace || run.length === 0) return none;
    const leftSlice = left?.slice ?? -1;
    const rightSlice = right?.slice ?? this.slices.length;
    const leftBlock = left?.block ?? -1;
    const rightBlock = right?.block ?? blocks.length;
    const startsWithText = !isEmptyParagraph(run[0]);
    const endsWithText = !isEmptyParagraph(run[run.length - 1]);
    if (rightSlice - leftSlice > 1) {
      // in the place of blocks of the source: the text that stood next to the kept block on
      // each side, where that is the text up to a block and not blank lines read as paragraphs
      const leftTight = blocks[leftBlock + 1] !== null;
      const rightTight = blocks[rightBlock - 1] !== null;
      return {
        leftBetween: leftTight && startsWithText ? leftSlice + 1 : null,
        rightBetween: rightTight && endsWithText ? rightSlice : null,
      };
    }
    // put in between two blocks that were neighbours, with nothing but that text between them
    if (rightBlock - leftBlock > 1) return none;
    if (!left) return { leftBetween: startsWithText ? 0 : null, rightBetween: null };
    if (!right) {
      // after the last block: before the newline the text ended with
      const tail = between[this.slices.length];
      return { leftBetween: null, rightBetween: endsWithText && isBlank(tail) ? rightSlice : null };
    }
    // the definitions between the two stay where they are, before it
    const holdsText = !isBlank(between[rightSlice]);
    return { leftBetween: holdsText && startsWithText ? rightSlice : null, rightBetween: null };
  }

  // What a run written anew reads as on its own: each stretch of blocks between two empty
  // paragraphs as the editor's spelling of it reads. It is what the output must read as there,
  // so keeping text never changes how new blocks read, whether or not they read as they are held
  // (`word ` loses its last space; two lists side by side read as one).
  private readAlone(run: ProseMirrorNode[], markers: boolean): ProseMirrorNode[] {
    const read: ProseMirrorNode[] = [];
    for (let at = 0; at < run.length; ) {
      if (isEmptyParagraph(run[at])) {
        read.push(run[at]);
        at += 1;
        continue;
      }
      let end = at;
      while (end < run.length && !isEmptyParagraph(run[end])) end += 1;
      const markdown = this.runMarkdown(run.slice(at, end), markers);
      if (isBlank(markdown)) {
        // blocks the editor writes as nothing (a heading with no text yet): between two blocks
        // their blank lines read as empty paragraphs, one more than alone
        const blankLines = (markdown.match(/\n\n/g) ?? []).length + 1;
        const empty = this.schema.nodes.paragraph.create();
        for (let k = 0; k < blankLines; k += 1) read.push(empty);
      } else read.push(...this.read(markdown));
      at = end;
    }
    return read;
  }

  private read(markdown: string): ProseMirrorNode[] {
    return (this.codec.parse(markdown).content ?? []).map((node) =>
      asBlock(this.schema.nodeFromJSON(node)),
    );
  }

  /** Whether `markdown` reads as `expected`, block for block. */
  readsAs(markdown: string, expected: ProseMirrorNode[]): boolean {
    try {
      const read = this.read(markdown);
      return read.length === expected.length && read.every((node, k) => node.eq(expected[k]));
    } catch {
      return false;
    }
  }

  // The definitions whose text was not written, at the end, so the kept links that use them
  // still read as links. One whose label another definition still written defines is left out.
  private withDefinitions(out: string, written: Set<number>): string {
    const { text, definitions, lineEnd } = this.source;
    if (definitions.length === 0) return out;
    // the index of the `between` text a definition is in
    const betweenOf = (from: number) => this.slices.filter((slice) => slice.to <= from).length;
    const isWritten = (from: number) => written.has(betweenOf(from));
    const missing = definitions.filter(
      (definition) =>
        definition.first &&
        !definitions.some((other) => other.label === definition.label && isWritten(other.from)),
    );
    if (missing.length === 0) return out;
    const separator = /(\r?\n){2}$/.test(out)
      ? ''
      : out.endsWith('\n')
        ? lineEnd
        : lineEnd.repeat(2);
    const appended = missing.map(({ from, to }) => text.slice(from, to)).join(lineEnd);
    return (out === '' ? '' : out + separator) + appended;
  }
}
