import { escapeHtml } from '../shared/untrusted';

// Keep in sync with tokenize = "unicode61 remove_diacritics 2 tokenchars '_+#'"
const HAS_TOKEN_CHAR = /[\p{L}\p{N}_+#]/u;
const ENDS_IN_TOKEN_CHAR = /[\p{L}\p{N}_+#]$/u;

/**
 * The FTS5 query for what the user typed: each term a quoted phrase, all of which must match. A
 * term with punctuation inside, such as a key (`ENG-123`), is a phrase of the words it splits
 * into, side by side. A term ending in a word character is a prefix of its last word, so `meet`
 * finds "meeting" and `ENG-12` finds ENG-123; one ending in punctuation (`hello!`) is not.
 */
export function toFtsQuery(input: string): string | null {
  const phrases: string[] = [];

  for (const term of input.trim().split(/\s+/).slice(0, 12)) {
    if (!HAS_TOKEN_CHAR.test(term)) continue;
    const escaped = term.replace(/"/g, '""');
    phrases.push(ENDS_IN_TOKEN_CHAR.test(term) ? `"${escaped}"*` : `"${escaped}"`);
  }

  return phrases.length ? phrases.join(' ') : null;
}

// What FTS5's highlight() and snippet() put around a match: control characters, which escaping
// leaves alone, so the marked text can be escaped first and the markers turned into tags after.
// Indexed text that holds one itself can only move where the bold falls, never add markup.
export const HIGHLIGHT_START = '\u0002';
export const HIGHLIGHT_END = '\u0003';

/**
 * Marked text from highlight() or snippet() as HTML: every character of the text escaped, then
 * each match wrapped in <b>…</b>. The result holds no markup but balanced, unnested <b> elements,
 * whatever the indexed text was, so the renderer can set it as HTML.
 */
export function highlightToHtml(marked: string): string {
  let html = '';
  let text = '';
  let open = false;
  const flush = () => {
    html += escapeHtml(text);
    text = '';
  };
  for (const char of marked) {
    if (char === HIGHLIGHT_START || char === HIGHLIGHT_END) {
      flush();
      const opening = char === HIGHLIGHT_START;
      if (opening !== open) html += opening ? '<b>' : '</b>';
      open = opening;
    } else {
      text += char;
    }
  }
  flush();
  return open ? `${html}</b>` : html;
}
