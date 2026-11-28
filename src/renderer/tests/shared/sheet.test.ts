import { describe, expect, it } from 'vitest';
import {
  SHEET_KINDS_BY_ROUTE,
  sheetKindOf,
  sheetKindsOf,
  sheetParam,
} from '@renderer/shared/lib/sheet';

// Which pages have a sheet and what each shows (shared/lib/sheet.ts): the routes' `sheet` param
// and `useSheet` both read it from here.

describe('a page’s sheet', () => {
  it('says the kind of item an id names', () => {
    expect(sheetKindOf('tsk_1')).toBe('task');
    expect(sheetKindOf('nte_1')).toBe('note');
    expect(sheetKindOf('evt_1')).toBe('event');
    expect(sheetKindOf('prj_1')).toBeUndefined();
    expect(sheetKindOf(undefined)).toBeUndefined();
  });

  it('shows the kinds its route lists, and none on a route with no sheet', () => {
    expect(sheetKindsOf('/app/$workspaceId/calendar')).toEqual(['event', 'task', 'note']);
    expect(sheetKindsOf('/app/$workspaceId/tasks/$taskId')).toEqual(['note']);
    expect(sheetKindsOf('/app/$workspaceId/home')).toEqual([]);
    expect(sheetKindsOf(undefined)).toEqual([]);
  });

  it('reads an id of one of the route’s kinds from the param, and drops any other', () => {
    for (const routeId of Object.keys(
      SHEET_KINDS_BY_ROUTE,
    ) as (keyof typeof SHEET_KINDS_BY_ROUTE)[]) {
      const param = sheetParam(routeId);
      for (const [kind, id] of [
        ['task', 'tsk_1'],
        ['note', 'nte_1'],
        ['event', 'evt_1'],
      ] as const) {
        const shown = (SHEET_KINDS_BY_ROUTE[routeId] as readonly string[]).includes(kind);
        expect(param.parse(id)).toBe(shown ? id : undefined);
      }
      expect(param.parse('prj_1')).toBeUndefined();
      expect(param.parse('note')).toBeUndefined();
      expect(param.parse(undefined)).toBeUndefined();
    }
  });
});
