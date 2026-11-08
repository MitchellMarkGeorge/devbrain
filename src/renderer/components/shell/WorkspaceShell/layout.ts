import type { WindowSize } from './context';

/** `breakpoint-medium` and `breakpoint-wide` (tokens.css); media queries can't read variables. */
const MEDIUM = 1080;
const WIDE = 1280;

export function windowSizeFor(width: number): WindowSize {
  if (width < MEDIUM) return 'compact';
  if (width < WIDE) return 'medium';
  return 'wide';
}

/**
 * How long the pointer rests on the sidebar toggle or the window's left edge before the drawer
 * peeks out (so a passing pointer doesn't open it), and how long it may be away from the drawer
 * before it closes again.
 */
export const PEEK_OPEN_DELAY = 200;
export const PEEK_CLOSE_DELAY = 300;
