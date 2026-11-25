import { isId } from '@common/ids';
import { entityLinkTokenizer, type EntityLinkToken } from '@common/entity-links';
import type { MentionTargetId } from '@common/types';
import { Marked, type Token, type TokenizerExtension, type Tokens } from 'marked';

/** One item a text mentions: how often, and the text around its first mention. */
export interface ExtractedMention {
  targetId: MentionTargetId;
  count: number;
  contextBefore: string;
  contextAfter: string;
}

// how much of the text is kept either side of the mention; the rest is cut with "…"
const BEFORE_LENGTH = 120;
const AFTER_LENGTH = 160;

/**
 * Markdown read as the editor reads it, as far as links go: GitHub-flavoured markdown, with the
 * editor's own entity-link tokenizer. The editor's other tokenizers (callouts, `<details>`, raw
 * HTML) aren't plugged in: they decide how a block is drawn, not whether a link in it is code.
 */
const marked = new Marked({ gfm: true });
const extension: TokenizerExtension = {
  name: entityLinkTokenizer.name,
  level: entityLinkTokenizer.level,
  start: entityLinkTokenizer.start,
  tokenizer: (src) => entityLinkTokenizer.tokenize(src),
};
marked.use({ extensions: [extension] });

/** a piece of a block's text: plain text, or a link (the mention or another) */
type Piece = string | EntityLinkToken;

/**
 * The items `markdown` mentions through `devbrain://` links, in the order of their first mention.
 * A link in code (a block, a span) is text, as the editor shows it, and so is one in raw HTML;
 * neither is a mention, nor is a link whose id doesn't have its type's shape.
 */
export function extractMentions(markdown: string): ExtractedMention[] {
  const found = new Map<MentionTargetId, ExtractedMention>();
  for (const pieces of blocksOf(marked.lexer(markdown))) {
    pieces.forEach((piece, i) => {
      if (typeof piece === 'string' || !isId(piece.entityType, piece.id)) return;
      const targetId = piece.id as MentionTargetId;
      const seen = found.get(targetId);
      if (seen) seen.count += 1;
      else found.set(targetId, { targetId, count: 1, ...contextOf(pieces, i) });
    });
  }
  return [...found.values()];
}

/**
 * The text of each block that holds inline text (a paragraph, a heading, a list item's text, a
 * table cell), in reading order, as pieces. Code blocks and raw HTML hold none.
 */
function* blocksOf(tokens: Token[]): Generator<Piece[]> {
  for (const token of tokens) {
    switch (token.type) {
      case 'code':
      case 'html':
        break;
      case 'paragraph':
      case 'heading':
      case 'text':
        // a list item's text is a `text` token with inline tokens; a bare one has none
        if ('tokens' in token && token.tokens) yield piecesOf(token.tokens);
        break;
      case 'list':
        for (const item of (token as Tokens.List).items) yield* blocksOf(item.tokens);
        break;
      case 'table': {
        const table = token as Tokens.Table;
        for (const cell of [...table.header, ...table.rows.flat()]) yield piecesOf(cell.tokens);
        break;
      }
      default:
        // a quote, or a block of another kind: its own blocks, if it has any
        if ('tokens' in token && token.tokens) yield* blocksOf(token.tokens);
    }
  }
}

/** inline tokens as plain text and links: emphasis, links and the like keep only their text */
function piecesOf(tokens: Token[]): Piece[] {
  const pieces: Piece[] = [];
  for (const token of tokens) {
    if (token.type === 'entityLink') pieces.push(token as unknown as EntityLinkToken);
    else if (token.type === 'br') pieces.push(' ');
    else if (token.type === 'image') pieces.push((token as Tokens.Image).text);
    // a tag (<kbd>, <u>) draws its text, which comes as the tokens next to it
    else if (token.type === 'html' || token.type === 'checkbox') continue;
    else if ('tokens' in token && token.tokens) pieces.push(...piecesOf(token.tokens));
    else if ('text' in token && typeof token.text === 'string') pieces.push(decode(token.text));
  }
  return pieces;
}

/** the block's text either side of piece `i`, other links shown by their labels */
function contextOf(
  pieces: Piece[],
  i: number,
): Pick<ExtractedMention, 'contextBefore' | 'contextAfter'> {
  const text = (part: Piece[]) =>
    part
      .map((piece) => (typeof piece === 'string' ? piece : piece.label))
      .join('')
      .replace(/\s+/g, ' ');
  const before = text(pieces.slice(0, i)).trimStart();
  const after = text(pieces.slice(i + 1)).trimEnd();
  return {
    contextBefore: before.length > BEFORE_LENGTH ? `…${before.slice(-BEFORE_LENGTH)}` : before,
    contextAfter: after.length > AFTER_LENGTH ? `${after.slice(0, AFTER_LENGTH)}…` : after,
  };
}

// `marked` leaves character references in text as written; these are the ones markdown text uses
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
    const code =
      name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : entity;
  });
}
