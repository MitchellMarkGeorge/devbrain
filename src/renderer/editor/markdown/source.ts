import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { ParsedText } from './types';

/**
 * The source map: which slice of a loaded text each top-level block of its document was read
 * from, and the text between those slices (docs/editor.md, "The source map"). The slices and the
 * text between them, in order, are the text exactly.
 */
export interface MarkdownSource {
  // as loaded, with its own line ends; every offset below is into it
  text: string;
  // the one kind of line end it uses (`\n` when it has none)
  lineEnd: '\n' | '\r\n';
  // The document's top-level nodes in order, by the slice they were read from. A slice starts at
  // its block's first line (with its indentation) and ends after the last character of its last
  // line that isn't blank, before that line's end. It gives one node, or the several lists a list that mixes
  // to-dos and bullets is split into. Null stands for one empty paragraph read from blank lines,
  // which has no slice: its blank lines are in the text between the blocks around it.
  blocks: (SourceBlock | null)[];
  // The text outside the slices: `between[i]` comes before the i-th slice (counting only blocks
  // that have one) and the last one after the last slice, so there is one more than there are
  // slices. It holds the line ends, the blank lines and the definitions.
  between: string[];
  // the link reference definitions (`[docs]: https://…`), in order; each is inside a `between`
  definitions: Definition[];
}

export interface SourceBlock {
  from: number;
  to: number;
  nodes: ProseMirrorNode[];
}

/** A link reference definition: its slice of the text and what it defines. */
export interface Definition {
  from: number;
  to: number;
  // as `marked` keys it: lower case, runs of spaces as one
  label: string;
  href: string;
  title: string | null;
  // the label's first definition, the one links read; a later one changes nothing
  first: boolean;
}

/** Why a text has no source map. A save of such a text writes the whole document. */
export type UnmappedReason =
  // `\r\n` and `\n` line ends both
  | 'mixed-line-ends'
  // a `\r` that isn't part of `\r\n`, which reads as a line end too
  | 'lone-carriage-return'
  // text between two tokens that isn't a definition `marked` left out
  | 'unread-text'
  // a token that is no block, blank line or definition, and gave no node
  | 'unread-token'
  // a node the schema can't make
  | 'invalid-node'
  // a definition inside a quote, a list item or another block, which would move with that block
  | 'nested-definition'
  // no blocks at all (an empty text, or only definitions), shown as a paragraph of its lines
  | 'no-blocks';

export type SourceReading =
  | { source: MarkdownSource; reason: null }
  | { source: null; reason: UnmappedReason };

// the line ends, and the blank lines after them, that a token's raw ends with
const TRAILING_LINE_ENDS = /(?:\n[^\S\n]*)+$/;
// the blank lines a token's raw starts with (the to-do list's tokenizer takes the ones before it)
const LEADING_BLANK_LINES = /^(?:[^\S\n]*\n)+/;

function lineEndOf(text: string): MarkdownSource['lineEnd'] | UnmappedReason {
  if (!text.includes('\r')) return '\n';
  if (/\r(?!\n)/.test(text)) return 'lone-carriage-return';
  return /(?:^|[^\r])\n/.test(text) ? 'mixed-line-ends' : '\r\n';
}

/** The source map of `text`, read as `parsed`, for documents of `schema`. */
export function readSource(text: string, parsed: ParsedText, schema: Schema): SourceReading {
  const unmapped = (reason: UnmappedReason): SourceReading => ({ source: null, reason });

  const lineEnd = lineEndOf(text);
  if (lineEnd !== '\n' && lineEnd !== '\r\n') return unmapped(lineEnd);
  if (!parsed.tokens) return unmapped('unread-text');
  if (!parsed.doc.content?.length) return unmapped('no-blocks');

  // The tokens' offsets are in the text with `\n` line ends. With `\r\n` each line end before an
  // offset is a character more; offsets only grow, so the line ends are counted once.
  let counted = 0;
  let lineEnds = 0;
  const offsetIn = (offset: number): number => {
    if (lineEnd === '\n') return offset;
    for (; counted < offset; counted += 1) {
      if (parsed.text.charCodeAt(counted) === 10) lineEnds += 1;
    }
    return offset + lineEnds;
  };
  // a token's slice, without the blank lines before its first line and the line ends and blank
  // lines after its last
  const sliceOf = (from: number, raw: string): { from: number; to: number } => {
    const leading = raw.match(LEADING_BLANK_LINES)?.[0].length ?? 0;
    const trailing = raw.slice(leading).match(TRAILING_LINE_ENDS)?.[0].length ?? 0;
    const start = offsetIn(from + leading);
    return { from: start, to: offsetIn(from + raw.length - trailing) };
  };

  const blocks: MarkdownSource['blocks'] = [];
  const definitions: Definition[] = [];
  const defined = new Set<string>();
  for (const { token, nodes, from, repeated } of parsed.tokens) {
    if (token.type === 'space') {
      nodes.forEach(() => blocks.push(null));
    } else if (token.type === 'def') {
      const first = !repeated;
      if (first) defined.add(token.tag);
      definitions.push({
        ...sliceOf(from, token.raw),
        label: token.tag,
        href: token.href,
        title: token.title || null,
        first,
      });
    } else if (nodes.length === 0) {
      return unmapped('unread-token');
    } else {
      try {
        const made = nodes.map((node) => schema.nodeFromJSON(node));
        blocks.push({ ...sliceOf(from, token.raw), nodes: made });
      } catch {
        return unmapped('invalid-node');
      }
    }
  }
  if (Object.keys(parsed.links).some((label) => !defined.has(label))) {
    return unmapped('nested-definition');
  }

  const between: string[] = [];
  let end = 0;
  for (const block of blocks) {
    if (!block) continue;
    between.push(text.slice(end, block.from));
    end = block.to;
  }
  between.push(text.slice(end));
  return { source: { text, lineEnd, blocks, between, definitions }, reason: null };
}
