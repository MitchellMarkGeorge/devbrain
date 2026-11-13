import type { Command } from './commands';
import { MODAL_ATTRIBUTE, SCOPE_ATTRIBUTE } from './scopes';

// the regions a cursor moves in: a list's rows, a board's cards
const REGIONS = `[${SCOPE_ATTRIBUTE}="list"], [${SCOPE_ATTRIBUTE}="board"]`;
const MENUS = '[role="menu"], [role="listbox"]';

/** `cursor.enter`: focuses the page's list or board, from nowhere (Vim's first `j`). */
export const ENTER_COMMAND_ID = 'cursor.enter';
/** `menu.down` / `menu.up`: Vim's `j`/`k` in an open menu, as its ↓/↑. */
export const MENU_DOWN_COMMAND_ID = 'menu.down';
export const MENU_UP_COMMAND_ID = 'menu.up';

// drawn and not hidden away (the old workspace's page stays mounted, hidden, under the splash)
function visible(element: Element): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

/** The page's first list or board on screen, outside any dialog. */
export function pageRegion(doc: Document): HTMLElement | null {
  for (const region of doc.querySelectorAll<HTMLElement>(REGIONS)) {
    if (!region.closest(`[${MODAL_ATTRIBUTE}]`) && visible(region)) return region;
  }
  return null;
}

/**
 * Focuses `region`'s cursor: its tab stop (the focused row, or the list while that row is
 * scrolled away), or its first focusable element. Returns whether something took focus.
 */
export function enterRegion(region: HTMLElement): boolean {
  const target =
    region.querySelector<HTMLElement>('[tabindex="0"]') ??
    region.querySelector<HTMLElement>('[tabindex]:not([tabindex="-1"]), button, a[href]');
  if (!target) return false;
  target.focus();
  return target.ownerDocument.activeElement === target;
}

/**
 * The commands the Vim keymap binds where nothing else would take its keys: `cursor.enter` while
 * focus is outside every list and board (on the page itself, after Esc left a field), and
 * `menu.down`/`menu.up` in an open menu, which knows the arrows but not `j`/`k`. Registered by
 * `KeyboardProvider`.
 */
export function cursorCommands(doc: Document = document): Command[] {
  const inRegion = () => doc.activeElement?.closest(REGIONS) != null;
  const menuItem = () => {
    const active = doc.activeElement;
    return active?.closest(MENUS) ? active : null;
  };
  const arrow =
    (key: 'ArrowDown' | 'ArrowUp') =>
    (_: unknown, { count = 1 }) => {
      for (let i = 0; i < count; i += 1) {
        (menuItem() ?? doc.body).dispatchEvent(
          new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }),
        );
      }
    };
  return [
    {
      id: ENTER_COMMAND_ID,
      title: 'Go to the list',
      scope: 'global',
      run: () => {
        const region = pageRegion(doc);
        if (region) enterRegion(region);
      },
      enabled: () => !inRegion() && pageRegion(doc) !== null,
    },
    {
      id: MENU_DOWN_COMMAND_ID,
      title: 'Next item',
      scope: 'global',
      run: arrow('ArrowDown'),
      enabled: () => menuItem() !== null,
    },
    {
      id: MENU_UP_COMMAND_ID,
      title: 'Previous item',
      scope: 'global',
      run: arrow('ArrowUp'),
      enabled: () => menuItem() !== null,
    },
  ];
}
