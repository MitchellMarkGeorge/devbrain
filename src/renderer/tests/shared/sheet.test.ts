import { describe, expect, it } from 'vitest';
import { sheetKindOf, sheetParam } from '@renderer/shared/lib/sheet';

// The `sheet` search param (shared/lib/sheet.ts): each route's schema lists the kinds its page's
// sheet shows.

describe('the sheet param', () => {
  it('says the kind of item an id names', () => {
    expect(sheetKindOf('tsk_1')).toBe('task');
    expect(sheetKindOf('nte_1')).toBe('note');
    expect(sheetKindOf('evt_1')).toBe('event');
    expect(sheetKindOf('prj_1')).toBeUndefined();
    expect(sheetKindOf(undefined)).toBeUndefined();
  });

  it('reads an id of one of the page’s kinds, and drops any other', () => {
    const param = sheetParam(['task', 'event']);
    expect(param.parse('tsk_1')).toBe('tsk_1');
    expect(param.parse('evt_1')).toBe('evt_1');
    expect(param.parse('nte_1')).toBeUndefined();
    expect(param.parse('prj_1')).toBeUndefined();
    expect(param.parse('note')).toBeUndefined();
    expect(param.parse(undefined)).toBeUndefined();
  });
});
