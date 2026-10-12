import { describe, it, expect } from 'vitest';
import { AuthType } from '../../integrations/types';
import { toAuth } from '../../integrations/auth';
import { createLinearProvider } from '../../integrations/providers/linear';
import { TaskSyncer } from '../../sync/task-syncer';
import { TaskCursor } from '../../sync/task-cursor';
import { TaskReconciler } from '../../sync/task-reconciler';
import { SyncWriter } from '../../sync/writer';
import { SyncCursor } from '../../sync/types';
import { CLOSED_ISSUE_WINDOW_MS } from '../../sync/constants';
import { scriptedFetch } from '../integrations/linear/fake-fetch';
import issueFixture from '../integrations/fixtures/linear/issue.json';
import page1Fixture from '../integrations/fixtures/linear/assigned-issues-page-1.json';
import page2Fixture from '../integrations/fixtures/linear/assigned-issues-page-2.json';

// TaskSyncer's cursor and modes, through the real Linear source and a scripted fetch, so each
// cursor is checked against the request it makes. Applying pages is covered by the engine tests.

const AUTH = toAuth({ type: AuthType.API_KEY, apiKey: 'lin_api_test' });
const VIEWER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-07T12:00:00.000Z');

// pulls only: nothing here applies a page or reconciles
function syncer(fetch: ReturnType<typeof scriptedFetch>): TaskSyncer {
  const tasks = createLinearProvider({ fetch, now: () => NOW }).tasks!;
  return new TaskSyncer({} as SyncWriter, tasks, {} as TaskReconciler, () => NOW);
}

function pull(fetch: ReturnType<typeof scriptedFetch>, cursor: SyncCursor | null) {
  return syncer(fetch).pull(AUTH, cursor);
}

function issuesPage(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return {
    data: {
      viewer: { id: VIEWER_ID, assignedIssues: { pageInfo: { hasNextPage, endCursor }, nodes } },
    },
  };
}

function issueAt(id: string, updatedAt: string) {
  return { ...issueFixture, id, updatedAt };
}

describe('TaskSyncer — initial mode', () => {
  it('walks two initial pages, then switches to incremental', async () => {
    const fetch = scriptedFetch([{ body: page1Fixture }, { body: page2Fixture }]);
    const tasks = syncer(fetch);

    const first = await tasks.pull(AUTH, null);
    expect(first.done).toBe(false);
    expect(first.tasks.map((task) => task.key)).toEqual(['ENG-123', 'ENG-124']);
    expect(first.projects.map((project) => project.title)).toEqual(['Sync engine']);
    expect(first.removedIds).toEqual([]);
    expect(first.nextCursor).toEqual({
      mode: 'initial',
      after: 'cursor-page-1',
      maxUpdatedAt: '2026-10-05T16:45:00.000Z',
    });

    const second = await tasks.pull(AUTH, first.nextCursor);
    expect(second.done).toBe(true);
    expect(second.tasks.map((task) => task.key)).toEqual(['ENG-205']);
    // the trashed issue is reported as removed, not mapped
    expect(second.removedIds).toEqual(['8f6a3c2e-1d4b-4e7a-9c0f-3b2a1e5d7e01']);
    // highest updatedAt seen (the trashed issue's) minus the 60-second overlap
    expect(second.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T08:59:00.000Z',
    });

    const [request1, request2] = fetch.requests;
    expect(request1.variables.after).toBeNull();
    expect(request2.variables.after).toBe('cursor-page-1');
  });

  it('carries the latest change across pages when it is on an earlier page', async () => {
    const fetch = scriptedFetch([
      { body: issuesPage([issueAt('a', '2026-10-06T09:00:00.000Z')], true, 'c1') },
      { body: issuesPage([issueAt('b', '2026-10-04T09:00:00.000Z')]) },
    ]);
    const tasks = syncer(fetch);

    const first = await tasks.pull(AUTH, null);
    const second = await tasks.pull(AUTH, first.nextCursor);

    expect(second.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T08:59:00.000Z',
    });
  });

  it('asks for open issues and those closed within the window on an initial pull', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await pull(fetch, null);

    const closedSince = new Date(NOW.getTime() - CLOSED_ISSUE_WINDOW_MS).toISOString();
    expect(fetch.requests[0].variables.filter).toEqual({
      or: [
        { state: { type: { nin: ['completed', 'canceled', 'duplicate'] } } },
        { completedAt: { gt: closedSince } },
        { canceledAt: { gt: closedSince } },
      ],
    });
  });

  it('starts incremental from now after an initial sync that found nothing', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    const page = await pull(fetch, null);
    expect(page.done).toBe(true);
    expect(page.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-07T11:59:00.000Z',
    });
  });

  it('treats an unreadable cursor as a fresh initial sync', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await pull(fetch, { mode: 'other' } as unknown as TaskCursor);
    expect(fetch.requests[0].variables.after).toBeNull();
    expect(fetch.requests[0].variables.filter).toHaveProperty('or');
    expect(fetch.requests[0].variables.filter).toMatchObject({
      or: expect.arrayContaining([{ completedAt: expect.anything() }]),
    });
  });

  it('counts what the source skipped on the page', async () => {
    const bad = { ...issueFixture, id: 'bad', state: { name: 'Odd', type: 'someday' } };
    const fetch = scriptedFetch([{ body: issuesPage([bad, issueFixture]) }]);
    const page = await pull(fetch, null);
    expect(page.skipped).toBe(1);
    expect(page.tasks.map((task) => task.externalId)).toEqual([issueFixture.id]);
  });
});

describe('TaskSyncer — incremental mode', () => {
  it('asks for issues updated since the cursor on an incremental pull', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    const cursor: TaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await pull(fetch, cursor);

    expect(fetch.requests[0].variables.filter).toEqual({
      or: [
        { updatedAt: { gt: '2026-10-06T00:00:00.000Z' } },
        { archivedAt: { gt: '2026-10-06T00:00:00.000Z' } },
      ],
    });
    // nothing changed, so the cursor stays where it was
    expect(page.nextCursor).toEqual(cursor);
  });

  it('keeps updatedSince fixed across incremental pages and advances it at the end', async () => {
    const fetch = scriptedFetch([
      { body: issuesPage([issueAt('a', '2026-10-07T10:00:00.000Z')], true, 'c1') },
      { body: issuesPage([issueAt('b', '2026-10-06T10:00:00.000Z')]) },
    ]);
    const tasks = syncer(fetch);
    const start: TaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };

    const first = await tasks.pull(AUTH, start);
    expect(first.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
      after: 'c1',
      maxUpdatedAt: '2026-10-07T10:00:00.000Z',
    });

    const second = await tasks.pull(AUTH, first.nextCursor);
    expect(fetch.requests[1].variables).toMatchObject({
      after: 'c1',
      filter: { or: [{ updatedAt: { gt: '2026-10-06T00:00:00.000Z' } }, expect.anything()] },
    });
    expect(second.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-07T09:59:00.000Z',
    });
  });

  it('reports an issue trashed since the cursor, though trashing left updatedAt unchanged', async () => {
    // as recorded live: trashing sets trashed and archivedAt, not updatedAt
    const trashed = {
      ...issueAt('t', '2026-10-05T09:00:00.000Z'),
      trashed: true,
      archivedAt: '2026-10-06T12:00:00.000Z',
    };
    const fetch = scriptedFetch([{ body: issuesPage([trashed]) }]);
    const cursor: TaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await pull(fetch, cursor);

    expect(page.removedIds).toEqual(['t']);
    expect(page.tasks).toEqual([]);
    // the cursor moves past archivedAt, so the same trash is not fetched on every run
    expect(page.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T11:59:00.000Z',
    });
  });

  it('never moves the incremental cursor backwards', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([issueAt('a', '2026-10-06T00:00:30.000Z')]) }]);
    const cursor: TaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await pull(fetch, cursor);
    expect(page.nextCursor).toEqual(cursor);
  });
});
