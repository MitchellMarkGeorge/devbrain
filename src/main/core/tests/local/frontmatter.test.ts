import { describe, it, expect } from 'vitest';
import { extractFrontmatter, serializeFrontmatter } from '../../local/frontmatter';

describe('serializeFrontmatter / extractFrontmatter', () => {
  it('round-trips attrs and body', () => {
    const raw = serializeFrontmatter({ id: 'nte_1', title: 'My note' }, 'Hello world');
    const { data: attrs, content: body } = extractFrontmatter(raw);
    expect(attrs).toEqual({ id: 'nte_1', title: 'My note' });
    expect(body).toBe('Hello world');
  });

  it('round-trips empty content', () => {
    const raw = serializeFrontmatter({ id: 'nte_1', title: '' }, '');
    const { data: attrs, content: body } = extractFrontmatter(raw);
    expect(attrs).toEqual({ id: 'nte_1', title: '' });
    expect(body).toBe('');
  });

  it('produces a leading --- delimited block', () => {
    const raw = serializeFrontmatter({ id: 'nte_1', title: 'x' }, 'body');
    expect(raw.startsWith('---\n')).toBe(true);
  });

  it('correctly round-trips titles containing YAML-special characters', () => {
    const title = 'Q3: Revenue - "final" [draft]';
    const raw = serializeFrontmatter({ id: 'nte_1', title }, 'body');
    const { data: attrs } = extractFrontmatter(raw);
    expect((attrs as { title: string }).title).toBe(title);
  });

  it('returns empty attrs and the raw string as body when there is no front matter', () => {
    const { data: attrs, content: body } = extractFrontmatter(
      'Just a plain markdown file, no front matter.',
    );
    expect(attrs).toEqual({});
    expect(body).toBe('Just a plain markdown file, no front matter.');
  });

  it('tolerates a leading UTF-8 byte order mark', () => {
    const raw = '\ufeff---\nid: nte_1\ntitle: hi\n---\nHello';
    const { data: attrs, content: body } = extractFrontmatter(raw);
    expect(attrs).toEqual({ id: 'nte_1', title: 'hi' });
    expect(body).toBe('Hello');
  });

  it('normalizes CRLF line endings regardless of the running platform', () => {
    const raw = '---\r\nid: nte_1\r\ntitle: hi\r\n---\r\nHello world';
    const { data: attrs, content: body } = extractFrontmatter(raw);
    expect(attrs).toEqual({ id: 'nte_1', title: 'hi' });
    // No stray \r should leak onto the front of the body.
    expect(body).toBe('Hello world');
  });

  it('accepts a YAML "..." document-end marker as the closing delimiter', () => {
    const raw = '---\nid: nte_1\ntitle: hi\n...\nHello';
    const { data: attrs, content: body } = extractFrontmatter(raw);
    expect(attrs).toEqual({ id: 'nte_1', title: 'hi' });
    expect(body).toBe('Hello');
  });
});
