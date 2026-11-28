import { z } from 'zod';
import { isId, type Id } from '@common/ids';

// The sheet beside a page (docs/renderer/routing.md, "Sheets"): one search param, `sheet`, holds
// the id of the task, note or event it shows, and the id's prefix says which. Each route's schema
// lists the kinds its page opens (`sheetParam`), so an id of another kind, or a `sheet` on a page
// with no sheet, is dropped like any other bad param.

export const SHEET_KINDS = ['task', 'note', 'event'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** The ids of these kinds: `SheetId<'task' | 'event'>` is `TaskId | EventId`. */
export type SheetId<K extends SheetKind = SheetKind> = K extends SheetKind ? Id<K> : never;

/** The kind of item an id names, or undefined for an id no sheet shows. */
export function sheetKindOf(id: unknown): SheetKind | undefined {
  return SHEET_KINDS.find((kind) => isId(kind, id));
}

/**
 * A route's `sheet` search param: the id of the item in the page's sheet, of one of the kinds the
 * page opens. Anything else leaves the param undefined rather than failing the page.
 */
export function sheetParam<K extends SheetKind>(kinds: readonly K[]) {
  return z
    .custom<SheetId<K>>(
      (value) => kinds.some((kind) => isId(kind, value)),
      'Not an id this page opens in its sheet',
    )
    .optional()
    .catch(undefined);
}
