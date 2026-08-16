import { dump, load } from 'js-yaml';

// Front matter boundary detection adapted from front-matter
// https://github.com/jxson/front-matter (MIT License, Copyright (c) Jason Campbell).
// Trimmed down for our use: only the standard `---` delimiter is supported
// (no legacy `= yaml =` form, since this format is only ever written by us),
// and there's no "allowUnsafe" toggle — js-yaml v4+'s `load` is safe by
// default, so there's nothing to opt out of.
const FRONTMATTER_PATTERN = /^\ufeff?---$([\s\S]*?)^(?:---|\.\.\.)\s*$(?:\n)?/m;

export interface FrontmatterDocument<T extends Record<string, unknown>> {
  data: T;
  content: string;
}

/**
 * Splits a document into its front matter attributes and body.
 *
 * CRLF line endings are normalized to LF before matching, so the result
 * doesn't depend on which OS wrote the file or which OS is reading it (as
 * opposed to only handling `\r` when the *running* platform is Windows).
 * A leading UTF-8 byte order mark, which some editors add automatically, is
 * also tolerated.
 */
export function extractFrontmatter<T extends Record<string, unknown>>(
  raw: string,
): FrontmatterDocument<T> {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = FRONTMATTER_PATTERN.exec(normalized);
  if (!match) {
    return { data: {} as T, content: normalized };
  }

  const attrs = (load(match[1].trim()) ?? {}) as T;
  const body = normalized.slice(match[0].length);
  return { data: attrs, content: body };
}

export function serializeFrontmatter(data: Record<string, unknown>, content: string): string {
  return `---\n${dump(data)}---\n${content}`;
}
