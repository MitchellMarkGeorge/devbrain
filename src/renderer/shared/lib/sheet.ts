import { z } from 'zod';
import { isId, type Id } from '@common/ids';
import type { FileRoutesById } from '@renderer/routeTree.gen';

// The sheet beside a page (docs/renderer/routing.md, "Sheets"): one search param, `sheet`, holds
// the id of the task, note or event it shows, and the id's prefix says which. This file is the one
// place that says which pages have a sheet and what each shows.

export const SHEET_KINDS = ['task', 'note', 'event'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** The ids of these kinds: `SheetId<'task' | 'event'>` is `TaskId | EventId`. */
export type SheetId<K extends SheetKind = SheetKind> = K extends SheetKind ? Id<K> : never;

/**
 * The routes whose page has a sheet, and the kinds of item each shows in it. A route's schema
 * takes its `sheet` param from here (`sheetParam`), and `useSheet` reads the page's kinds from
 * here, so the two can't disagree. A route not listed has no sheet: its schema has no `sheet`,
 * and its page never reads one.
 */
export const SHEET_KINDS_BY_ROUTE = {
  // the board's cards (the list and the group view open a task's page)
  '/app/$workspaceId/tasks/': ['task'],
  // a project's Tasks tab, which is the tasks views
  '/app/$workspaceId/projects/$projectId': ['task'],
  // a task made from the note
  '/app/$workspaceId/notes/$noteId': ['task'],
  // the task note
  '/app/$workspaceId/tasks/$taskId': ['note'],
  // an event, a task due (the agenda lists both), an event's note
  '/app/$workspaceId/calendar': ['event', 'task', 'note'],
} as const satisfies Partial<Record<keyof FileRoutesById, readonly SheetKind[]>>;

export type SheetRouteId = keyof typeof SHEET_KINDS_BY_ROUTE;

/** The kinds the sheet of the page at this route shows; none for a route with no sheet. */
export function sheetKindsOf(routeId: string | undefined): readonly SheetKind[] {
  return routeId !== undefined && routeId in SHEET_KINDS_BY_ROUTE
    ? SHEET_KINDS_BY_ROUTE[routeId as SheetRouteId]
    : [];
}

/** The kind of item an id names, or undefined for an id no sheet shows. */
export function sheetKindOf(id: unknown): SheetKind | undefined {
  return SHEET_KINDS.find((kind) => isId(kind, id));
}

/**
 * A route's `sheet` search param: the id of the item in its page's sheet, of one of the kinds the
 * page shows. Anything else leaves the param undefined rather than failing the page.
 */
export function sheetParam<R extends SheetRouteId>(routeId: R) {
  const kinds: readonly SheetKind[] = SHEET_KINDS_BY_ROUTE[routeId];
  return z
    .custom<SheetId<(typeof SHEET_KINDS_BY_ROUTE)[R][number]>>(
      (value) => kinds.some((kind) => isId(kind, value)),
      'Not an id this page opens in its sheet',
    )
    .optional()
    .catch(undefined);
}
