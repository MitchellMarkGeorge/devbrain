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
