// @vitest-environment node
// (it reads the renderer's files from disk, by file: URL, and draws nothing)
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The window's Content-Security-Policy (src/renderer/index.html) loads images from 'self' only, so a
// data: URL in a stylesheet (a mask, a background) is blocked in the app, though Storybook and these
// tests, which don't enforce the policy, draw it. Stylesheets reference image files instead, which
// the build keeps as files (vite/renderer.config.ts).

// every stylesheet in the renderer, read from disk (Vitest stubs CSS modules, so importing them
// gives no text)
const renderer = new URL('../../', import.meta.url);
const stylesheets = (readdirSync(renderer, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.css'))
  .map((file) => [file, readFileSync(new URL(file, renderer), 'utf8')] as const);

describe("the window's Content-Security-Policy", () => {
  it('allows images from the app alone, not data: URLs', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(policy).toBeDefined();
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toMatch(/img-src[^;]*data:/);
  });

  it('is never asked for a data: URL by a stylesheet', () => {
    expect(stylesheets.length).toBeGreaterThan(10);
    const offending = stylesheets
      .filter(([, css]) => /url\(\s*['"]?data:/i.test(css))
      .map(([file]) => file);
    expect(offending).toEqual([]);
  });
});
