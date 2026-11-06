import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BAD_REQUEST_PAGE,
  DONE_PAGE,
  FAILED_PAGE,
  LOGOMARK_DARK_SVG,
  LOGOMARK_SVG,
  NOT_FOUND_PAGE,
} from '../../../integrations/oauth/pages';

const asset = (name: string) =>
  readFileSync(new URL(`../../../../../renderer/assets/${name}`, import.meta.url), 'utf8').trim();

describe('OAuth loopback pages', () => {
  it('embed the logomark assets unchanged', () => {
    expect(LOGOMARK_SVG).toBe(asset('devbrain-logomark.svg'));
    expect(LOGOMARK_DARK_SVG).toBe(asset('devbrain-logomark-dark.svg'));
  });

  it('load nothing from the network', () => {
    for (const page of [DONE_PAGE, FAILED_PAGE, BAD_REQUEST_PAGE, NOT_FOUND_PAGE]) {
      expect(page).not.toMatch(/(?:src|href|srcset)="(?!data:)/);
      expect(page).not.toMatch(/url\(|@import/);
    }
  });
});
