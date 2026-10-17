import { describe, it, expect, vi } from 'vitest';
import { safeExternalUrl, safeHexColor } from '@common/safe-url';
import { escapeHtml, guardOpenExternal } from '../../shared/untrusted';
import { UnsafeUrlError } from '../../shared/errors';

// The untrusted-content contract (docs/security/untrusted-content.md): which URLs may be opened,
// and escaping for what core hands out as HTML.

describe('safeExternalUrl', () => {
  it('accepts absolute http and https URLs, normalised', () => {
    expect(safeExternalUrl('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(safeExternalUrl('http://localhost:3000/a?b=1#c')).toBe('http://localhost:3000/a?b=1#c');
    expect(safeExternalUrl('  HTTPS://Linear.app/team/issue/ENG-1  ')).toBe(
      'https://linear.app/team/issue/ENG-1',
    );
    // the parser escapes what would break out of an attribute
    expect(safeExternalUrl('https://example.com/"><script>')).toBe(
      'https://example.com/%22%3E%3Cscript%3E',
    );
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'mailto:someone@example.com',
    'tel:+15555550100',
    'devbrain://open',
    'ftp://example.com/file',
    'blob:https://example.com/uuid',
  ])('refuses the scheme of %j', (url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it.each([
    '//evil.example/path',
    '/relative/path',
    'example.com',
    'https://',
    '',
    'https://user:secret@example.com',
    'https://bank.example@evil.example',
  ])('refuses %j: relative, hostless or carrying credentials', (url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it('refuses what is not a string', () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe('safeHexColor', () => {
  it('accepts #rrggbb only', () => {
    expect(safeHexColor('#1A73e8')).toBe('#1A73e8');
    for (const value of ['red', '#fff', '#1a73e8;background:url(x)', 'url(https://x)', '', null]) {
      expect(safeHexColor(value), String(value)).toBeNull();
    }
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that start markup or end an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&amp;</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;',
    );
  });
});

describe('guardOpenExternal', () => {
  it('opens an http or https URL, normalised', async () => {
    const open = vi.fn(async () => {});
    await guardOpenExternal(open)(' HTTPS://Example.com/a ');
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/a');
  });

  it('throws UnsafeUrlError for any other URL, and opens nothing', async () => {
    const open = vi.fn(async () => {});
    const guarded = guardOpenExternal(open);
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://a:b@example.com']) {
      await expect(guarded(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("keeps the URL off the error's message", async () => {
    const guarded = guardOpenExternal(async () => {});
    await expect(guarded('file:///home/user/secret-token')).rejects.toMatchObject({
      code: 'unsafe_url',
      message: expect.not.stringContaining('secret-token'),
    });
  });
});
