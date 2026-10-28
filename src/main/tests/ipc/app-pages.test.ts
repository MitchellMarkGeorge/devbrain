import { describe, expect, it } from 'vitest';
import { appPages } from '@main/ipc/app-pages';

describe('appPages', () => {
  it("in development, allows any page on the dev server's origin only", () => {
    const pages = appPages({ devServerUrl: 'http://localhost:5173', indexHtml: '/app/index.html' });

    expect(pages.includes('http://localhost:5173/')).toBe(true);
    expect(pages.includes('http://localhost:5173/tasks?x=1#top')).toBe(true);
    expect(pages.includes('http://localhost:5174/')).toBe(false);
    expect(pages.includes('https://localhost:5173/')).toBe(false);
    expect(pages.includes('file:///app/index.html')).toBe(false);
  });

  it("otherwise, allows the built renderer's index.html only, with any hash or query", () => {
    const pages = appPages({ indexHtml: '/app/dist/renderer/index.html' });

    expect(pages.includes('file:///app/dist/renderer/index.html')).toBe(true);
    expect(pages.includes('file:///app/dist/renderer/index.html#/tasks')).toBe(true);
    expect(pages.includes('file:///app/dist/renderer/other.html')).toBe(false);
    expect(pages.includes('file:///etc/passwd')).toBe(false);
    expect(pages.includes('https://example.com/app/dist/renderer/index.html')).toBe(false);
  });

  it('refuses no URL and one that does not parse', () => {
    const pages = appPages({ indexHtml: '/app/index.html' });

    expect(pages.includes(undefined)).toBe(false);
    expect(pages.includes(null)).toBe(false);
    expect(pages.includes('')).toBe(false);
    expect(pages.includes('not a url')).toBe(false);
  });
});
