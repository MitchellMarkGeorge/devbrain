import { escapeHtml } from '../shared/untrusted';

// Keep in sync with tokenize = "unicode61 remove_diacritics 2 tokenchars '_+#'"
const HAS_TOKEN_CHAR = /[\p{L}\p{N}_+#]/u;
const ALL_TOKEN_CHARS = /^[\p{L}\p{N}_+#]+$/u;

export function toFtsQuery(input: string): string | null {
  const phrases: string[] = [];

  for (const term of input.trim().split(/\s+/).slice(0, 12)) {
    if (!HAS_TOKEN_CHAR.test(term)) continue;
    const escaped = term.replace(/"/g, '""');
    phrases.push(ALL_TOKEN_CHARS.test(term) ? `"${escaped}"*` : `"${escaped}"`);
  }

  return phrases.length ? phrases.join(' ') : null;
}

// What FTS5's highlight() and snippet() put around a match: control characters, which no indexed
// text holds (stripHighlightMarkers removes them before indexing), so the marked text can be
// escaped first and the markers turned into tags after.
export const HIGHLIGHT_START = '\u0002';
export const HIGHLIGHT_END = '\u0003';

// text to index, without the marker characters
export function stripHighlightMarkers(text: string): string {
  return text.split(HIGHLIGHT_START).join('').split(HIGHLIGHT_END).join('');
}

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
