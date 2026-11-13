import { describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { IntegrationStatus, type SourceSyncStatus } from '@common/types';
import { entityPath } from '../../pages/app/entities';
import { mutationErrorCopy } from '../../pages/app/mutation-errors';
import { summarizeSync } from '../../pages/app/sync-state';

// The workspace layout's pure helpers: where an entity opens, a failed write's words, and the
// sidebar's sync line.

const WS = 'wsp_work' as WorkspaceId;

describe('entityPath', () => {
  it('opens tasks, projects and notes at their pages', () => {
    expect(entityPath(WS, { id: 'tsk_1' })).toBe('/app/wsp_work/tasks/tsk_1');
    expect(entityPath(WS, { id: 'prj_1' })).toBe('/app/wsp_work/projects/prj_1');
    expect(entityPath(WS, { id: 'nte_1' })).toBe('/app/wsp_work/notes/nte_1');
  });

  it('opens an event in the calendar on its day', () => {
    expect(entityPath(WS, { id: 'evt_1', startAt: new Date(2026, 6, 1, 10) })).toBe(
      '/app/wsp_work/calendar?date=2026-07-01&open=evt_1',
    );
    expect(entityPath(WS, { id: 'evt_1' })).toBe('/app/wsp_work/calendar?open=evt_1');
  });

  it('has nothing for another kind of id', () => {
    expect(entityPath(WS, { id: 'cal_1' })).toBeNull();
    expect(entityPath(WS, { id: 'nonsense' })).toBeNull();
  });
});

// a failed call as tRPC's client carries it
const failure = (code: string, message = 'Nope', data: Record<string, unknown> = {}) => ({
  data: { code, message, data },
});

describe('mutationErrorCopy', () => {
  it('explains a synced task', () => {
    expect(mutationErrorCopy(failure('external_read_only'), 'Couldn’t move the task')).toEqual({
      title: 'This task is synced from Linear',
      description: 'Change it there, or detach it to edit it here.',
    });
  });

  it('says when to retry a rate-limited call', () => {
    const retryAt = new Date(2026, 6, 1, 9, 15);
    const copy = mutationErrorCopy(failure('rate_limited', 'Slow down', { retryAt }), 'x', {
      formatTime: () => '9:15 AM',
    });
    expect(copy).toEqual({ title: 'Too many requests', description: 'Try again after 9:15 AM.' });
    expect(mutationErrorCopy(failure('rate_limited')).description).toBe(
      'Try again in a few minutes.',
    );
  });

  it('asks to wait for a reconnect before switching the account', () => {
    expect(mutationErrorCopy(failure('integration_busy'), 'Couldn’t switch Linear')).toEqual({
      title: 'Couldn’t switch Linear',
      description: 'The account is being reconnected. Try again once its sign-in has finished.',
    });
  });

  it('keeps an internal error generic', () => {
    expect(mutationErrorCopy(new Error('boom'))).toEqual({
      title: 'Something went wrong',
      description: undefined,
    });
    expect(mutationErrorCopy(failure('internal', 'secret detail'), 'Couldn’t save')).toEqual({
      title: 'Something went wrong',
      description: 'Couldn’t save',
    });
  });

  it('names the action, with core’s reason', () => {
    expect(mutationErrorCopy(failure('not_found'), 'Couldn’t open the task')).toEqual({
      title: 'Couldn’t open the task',
      description: 'It may have been deleted.',
    });
    expect(
      mutationErrorCopy(failure('task_hierarchy', 'A task can’t be its own parent'), 'x'),
    ).toEqual({ title: 'x', description: 'A task can’t be its own parent' });
  });
});

const NOW = new Date(2026, 6, 1, 9, 0);

function source(extra: Partial<SourceSyncStatus> = {}): SourceSyncStatus {
  return {
    sourceId: 'src_1',
    integrationId: 'int_1',
    provider: 'linear',
    sourceType: 'tasks',
    status: IntegrationStatus.CONNECTED,
    enabled: true,
    running: false,
    lastSyncedAt: new Date(2026, 6, 1, 8, 58),
    lastError: null,
    retryAt: null,
    ...extra,
  } as SourceSyncStatus;
}

describe('summarizeSync', () => {
  it('shows nothing while nothing syncs', () => {
    expect(summarizeSync([], true, NOW)).toBeNull();
    expect(summarizeSync([source({ enabled: false })], true, NOW)).toBeNull();
    expect(summarizeSync([source({ status: IntegrationStatus.DISABLED })], true, NOW)).toBeNull();
  });

  it('says when the last run finished', () => {
    const earlier = source({ sourceId: 'src_2' as never, lastSyncedAt: new Date(2026, 6, 1, 7) });
    expect(summarizeSync([source(), earlier], true, NOW)).toEqual({
      state: 'synced',
      lastSyncedAt: new Date(2026, 6, 1, 8, 58),
      retryAt: null,
    });
  });

  it('puts the worst state first', () => {
    const failed = source({ lastError: 'Boom' });
    const running = source({ running: true });
    const limited = source({ lastError: 'Slow', retryAt: new Date(2026, 6, 1, 9, 15) });
    expect(summarizeSync([failed, running], false, NOW)?.state).toBe('offline');
    expect(summarizeSync([failed, running], true, NOW)?.state).toBe('syncing');
    expect(summarizeSync([failed, limited], true, NOW)?.state).toBe('error');
    expect(summarizeSync([limited], true, NOW)).toMatchObject({
      state: 'rate-limited',
      retryAt: new Date(2026, 6, 1, 9, 15),
    });
    expect(
      summarizeSync([source({ status: IntegrationStatus.NEEDS_REAUTH })], true, NOW)?.state,
    ).toBe('error');
  });
});
