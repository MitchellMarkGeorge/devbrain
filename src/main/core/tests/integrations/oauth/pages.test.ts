import { describe, expect, it } from 'vitest';
import {
  BAD_REQUEST_PAGE,
  DONE_PAGE,
  FAILED_PAGE,
  NOT_FOUND_PAGE,
} from '../../../integrations/oauth/pages';

const PAGES = [DONE_PAGE, FAILED_PAGE, BAD_REQUEST_PAGE, NOT_FOUND_PAGE];

describe('OAuth loopback pages', () => {
  it('fill in every placeholder', () => {
    for (const page of PAGES) expect(page).not.toMatch(/{{|}}/);
  });

  // the listener stops accepting once it has answered, so nothing a page asks for would arrive
  it('load nothing from the network', () => {
    for (const page of PAGES) {
      expect(page).not.toMatch(/(?:src|href|srcset)="(?!data:)/);
      expect(page).not.toMatch(/url\(|@import/);
    }
  });
});
