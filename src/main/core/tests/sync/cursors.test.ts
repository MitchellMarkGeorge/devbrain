import { describe, it, expect } from 'vitest';
import { eventCursorSchema } from '../../sync/event-cursor';
import { taskConfigSchema, taskCursorSchema } from '../../sync/task-cursor';

// The cursors keep the shape the Linear and Google cursors were stored in, so stored ones parse.

describe('sync cursors', () => {
  it('accepts both task cursor modes', () => {
    expect(taskCursorSchema.parse({ mode: 'initial', after: null, maxUpdatedAt: null })).toEqual({
      mode: 'initial',
      after: null,
      maxUpdatedAt: null,
    });
    expect(
      taskCursorSchema.parse({ mode: 'incremental', updatedSince: '2026-10-01T00:00:00Z' }),
    ).toEqual({ mode: 'incremental', updatedSince: '2026-10-01T00:00:00Z' });
  });

  it('accepts an incremental task cursor part way through its pages', () => {
    const cursor = {
      mode: 'incremental',
      updatedSince: '2026-10-01T00:00:00Z',
      after: 'c1',
      maxUpdatedAt: '2026-10-02T00:00:00Z',
    };
    expect(taskCursorSchema.parse(cursor)).toEqual(cursor);
  });

  it('rejects an unreadable task cursor', () => {
    expect(taskCursorSchema.safeParse(null).success).toBe(false);
    expect(taskCursorSchema.safeParse({ mode: 'other' }).success).toBe(false);
    expect(
      taskCursorSchema.safeParse({ mode: 'incremental', updatedSince: 'yesterday' }).success,
    ).toBe(false);
  });

  it('accepts an events cursor keyed by calendar', () => {
    const cursor = { calendars: { primary: { syncToken: null, pageToken: 'p2' } } };
    expect(eventCursorSchema.parse(cursor)).toEqual(cursor);
    expect(eventCursorSchema.safeParse({ calendars: { primary: {} } }).success).toBe(false);
  });

  it("accepts an events cursor mid-run: a full pass's lower bound and the calendars left", () => {
    const cursor = {
      calendars: {
        primary: { syncToken: null, pageToken: 'p2', timeMin: '2026-09-09T12:00:00.000Z' },
        team: { syncToken: 't1', pageToken: null },
      },
      pending: ['primary', 'team'],
    };
    expect(eventCursorSchema.parse(cursor)).toEqual(cursor);
    expect(
      eventCursorSchema.safeParse({
        calendars: { primary: { syncToken: null, pageToken: null, timeMin: 'last month' } },
      }).success,
    ).toBe(false);
  });
});

describe('sync config', () => {
  it('parses task config; an events source has none stored', () => {
    expect(taskConfigSchema.parse({})).toEqual({});
  });
});
