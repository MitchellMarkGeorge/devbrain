import { describe, it, expect } from 'vitest';
import { toFtsQuery } from '../../search/utils';

describe('toFtsQuery', () => {
  it('wraps a single alphanumeric term as a quoted prefix phrase', () => {
    expect(toFtsQuery('widget')).toBe('"widget"*');
  });

  it('wraps each word of a multi-word query separately', () => {
    expect(toFtsQuery('widget sprint')).toBe('"widget"* "sprint"*');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toFtsQuery('  widget  ')).toBe('"widget"*');
  });

  it('collapses runs of internal whitespace between words', () => {
    expect(toFtsQuery('widget    sprint')).toBe('"widget"* "sprint"*');
  });

  it('returns null for an empty string', () => {
    expect(toFtsQuery('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(toFtsQuery('   ')).toBeNull();
  });

  it('drops terms made up entirely of punctuation', () => {
    expect(toFtsQuery('widget !!! sprint')).toBe('"widget"* "sprint"*');
  });

  it('returns null when every term is punctuation-only', () => {
    expect(toFtsQuery('!!! ---')).toBeNull();
  });

  it('quotes without a prefix star when a term has non-token punctuation mixed in', () => {
    expect(toFtsQuery('hello!')).toBe('"hello!"');
  });

  it('treats underscore, plus, and hash as token characters (prefix retained)', () => {
    expect(toFtsQuery('c++')).toBe('"c++"*');
    expect(toFtsQuery('snake_case')).toBe('"snake_case"*');
    expect(toFtsQuery('c#')).toBe('"c#"*');
  });

  it('treats unicode letters and digits as token characters', () => {
    expect(toFtsQuery('café')).toBe('"café"*');
    expect(toFtsQuery('123')).toBe('"123"*');
  });

  it('escapes embedded double quotes and drops the prefix star', () => {
    expect(toFtsQuery('foo"bar')).toBe('"foo""bar"');
  });

  it('caps the query at the first 12 terms', () => {
    const words = Array.from({ length: 15 }, (_, i) => `term${i}`);
    const result = toFtsQuery(words.join(' '));

    expect(result).toBe(
      words
        .slice(0, 12)
        .map((w) => `"${w}"*`)
        .join(' '),
    );
  });
});
