import { describe, it, expect } from 'vitest';
import { AuthType, LinearTaskCursor } from '../../../integrations/types';
import { toAuth } from '../../../integrations/auth';
import { TaskSource } from '../../../integrations/providers/provider';
import { createLinearProvider } from '../../../integrations/providers/linear';
import { TaskPriority, TaskStatus } from '../../../tasks/types';
import { CLOSED_ISSUE_WINDOW_MS, LOOKUP_BATCH_SIZE, PAGE_SIZE } from '../../../sync/constants';
import { RateLimitError } from '../../../shared/errors';
import { jsonResponse, RecordedRequest, scriptedFetch } from './fake-fetch';
import issueFixture from '../fixtures/linear/issue.json';
import page1Fixture from '../fixtures/linear/assigned-issues-page-1.json';
import page2Fixture from '../fixtures/linear/assigned-issues-page-2.json';
import rateLimitedFixture from '../fixtures/linear/rate-limited.json';
import recordedPageFixture from '../fixtures/linear/recorded-assigned-issues.json';
import recordedViewerFixture from '../fixtures/linear/recorded-viewer.json';
import recordedClosedFixture from '../fixtures/linear/recorded-closed-and-trashed.json';

const AUTH = toAuth({ type: AuthType.API_KEY, apiKey: 'lin_api_test' });
const VIEWER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-07T12:00:00.000Z');

function source(fetch: ReturnType<typeof scriptedFetch>): TaskSource {
  return createLinearProvider({ fetch, now: () => NOW }).tasks!;
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

describe('Linear tasks — pull', () => {
  it('walks two initial pages, then switches to incremental', async () => {
    const fetch = scriptedFetch([{ body: page1Fixture }, { body: page2Fixture }]);
    const tasks = source(fetch);

    const first = await tasks.pull(AUTH, null, {});
    expect(first.done).toBe(false);
    expect(first.tasks.map((task) => task.key)).toEqual(['ENG-123', 'ENG-124']);
    expect(first.projects.map((project) => project.title)).toEqual(['Sync engine']);
    expect(first.removedIds).toEqual([]);
    expect(first.nextCursor).toEqual({
      mode: 'initial',
      after: 'cursor-page-1',
      maxUpdatedAt: '2026-10-05T16:45:00.000Z',
    });

    const second = await tasks.pull(AUTH, first.nextCursor, {});
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
    expect(request1.variables.first).toBe(PAGE_SIZE);
    expect(request2.variables.after).toBe('cursor-page-1');
    expect(request1.query).toMatch(/orderBy: updatedAt/);
    expect(request1.query).toMatch(/includeArchived: true/);
  });

  it('asks for open issues and those closed within the window on an initial pull', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await source(fetch).pull(AUTH, null, {});

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
    const page = await source(fetch).pull(AUTH, null, {});
    expect(page.done).toBe(true);
    expect(page.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-07T11:59:00.000Z',
    });
  });

  it('asks for issues updated since the cursor on an incremental pull', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    const cursor: LinearTaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await source(fetch).pull(AUTH, cursor, {});

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
    const tasks = source(fetch);
    const start: LinearTaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };

    const first = await tasks.pull(AUTH, start, {});
    expect(first.nextCursor).toEqual({
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
      after: 'c1',
      maxUpdatedAt: '2026-10-07T10:00:00.000Z',
    });

    const second = await tasks.pull(AUTH, first.nextCursor, {});
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
    const cursor: LinearTaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await source(fetch).pull(AUTH, cursor, {});

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
    const cursor: LinearTaskCursor = {
      mode: 'incremental',
      updatedSince: '2026-10-06T00:00:00.000Z',
    };
    const page = await source(fetch).pull(AUTH, cursor, {});
    expect(page.nextCursor).toEqual(cursor);
  });

  it('treats an unreadable cursor as a fresh initial sync', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await source(fetch).pull(AUTH, { mode: 'other' } as unknown as LinearTaskCursor, {});
    expect(fetch.requests[0].variables.after).toBeNull();
    expect(fetch.requests[0].variables.filter).toHaveProperty('or');
  });

  it('skips and counts an issue that fails to validate, keeping the rest of the page', async () => {
    const bad = { ...issueFixture, id: 'bad', state: { name: 'Odd', type: 'someday' } };
    const fetch = scriptedFetch([{ body: issuesPage([bad, issueFixture]) }]);
    const page = await source(fetch).pull(AUTH, null, {});
    expect(page.skipped).toBe(1);
    expect(page.tasks.map((task) => task.externalId)).toEqual([issueFixture.id]);
  });

  it('lists each project once however many of its issues are on the page', async () => {
    const fetch = scriptedFetch([
      {
        body: issuesPage([
          issueAt('a', issueFixture.updatedAt),
          issueAt('b', issueFixture.updatedAt),
        ]),
      },
    ]);
    const page = await source(fetch).pull(AUTH, null, {});
    expect(page.tasks).toHaveLength(2);
    expect(page.projects).toHaveLength(1);
  });

  it('passes a rate limit through to the engine', async () => {
    const fetch = scriptedFetch([{ status: 400, body: rateLimitedFixture }]);
    await expect(source(fetch).pull(AUTH, null, {})).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe('Linear tasks — listAssignedIds', () => {
  it('pages through the ids of open assigned issues to the end', async () => {
    const idsPage = (ids: string[], hasNextPage: boolean, endCursor: string | null) => ({
      data: {
        viewer: {
          assignedIssues: {
            pageInfo: { hasNextPage, endCursor },
            nodes: ids.map((id) => ({ id })),
          },
        },
      },
    });
    const fetch = scriptedFetch([
      { body: idsPage(['a', 'b'], true, 'c1') },
      { body: idsPage(['c'], false, 'c2') },
    ]);

    expect(await source(fetch).listAssignedIds(AUTH)).toEqual(['a', 'b', 'c']);
    expect(fetch.requests.map((request) => request.variables.after)).toEqual([null, 'c1']);
    expect(fetch.requests[0].variables.filter).toEqual({
      state: { type: { nin: ['completed', 'canceled', 'duplicate'] } },
    });
    expect(fetch.requests[0].query).toMatch(/nodes\s*{\s*id\s*}/);
  });
});

describe('Linear tasks — lookup', () => {
  // answers each batch with every requested id except the ones in `missing`
  function lookupResponder(missing: Set<string>, overrides: Record<string, object> = {}) {
    return (request: RecordedRequest) => {
      const ids = request.variables.ids as string[];
      const nodes = ids
        .filter((id) => !missing.has(id))
        .map((id) => ({ ...issueFixture, id, ...overrides[id] }));
      return jsonResponse({ data: { viewer: { id: VIEWER_ID }, issues: { nodes } } });
    };
  }

  it('splits 250 ids into three requests and reports the ones that did not resolve', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `issue-${i}`);
    const missing = new Set(['issue-5', 'issue-150', 'issue-249']);
    const respond = lookupResponder(missing);
    const fetch = scriptedFetch([respond, respond, respond]);

    const result = await source(fetch).lookup(AUTH, ids);

    expect(fetch.requests.map((request) => (request.variables.ids as string[]).length)).toEqual([
      LOOKUP_BATCH_SIZE,
      LOOKUP_BATCH_SIZE,
      50,
    ]);
    expect(fetch.requests[0].query).toMatch(/includeArchived: true/);
    expect(result.tasks).toHaveLength(247);
    expect(result.gone).toEqual(['issue-5', 'issue-150', 'issue-249']);
    expect(result.skipped).toBe(0);
  });

  it('marks a reassigned issue as not assigned to the viewer and a trashed one as gone', async () => {
    const respond = lookupResponder(new Set(), {
      reassigned: { assignee: { id: 'someone-else' } },
      trashed: { trashed: true },
    });
    const fetch = scriptedFetch([respond]);

    const result = await source(fetch).lookup(AUTH, ['kept', 'reassigned', 'trashed']);

    expect(
      Object.fromEntries(result.tasks.map((task) => [task.externalId, task.assignedToViewer])),
    ).toEqual({ kept: true, reassigned: false });
    expect(result.gone).toEqual(['trashed']);
  });

  it('counts an issue that fails to validate as skipped, not gone', async () => {
    const respond = lookupResponder(new Set(), { odd: { priority: 9 } });
    const fetch = scriptedFetch([respond]);

    const result = await source(fetch).lookup(AUTH, ['odd', 'fine']);

    expect(result.tasks.map((task) => task.externalId)).toEqual(['fine']);
    expect(result.gone).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('returns the projects of the issues it finds', async () => {
    const fetch = scriptedFetch([lookupResponder(new Set())]);

    const result = await source(fetch).lookup(AUTH, ['a', 'b']);

    // both issues are in the fixture's project, which comes back once
    expect(result.projects.map((project) => project.externalId)).toEqual([issueFixture.project.id]);
    expect(result.goneProjects).toEqual([]);
  });

  it('looks up project ids after the issues and reports missing and trashed ones as gone', async () => {
    const issues = lookupResponder(new Set());
    const projects = (request: RecordedRequest) => {
      const ids = request.variables.ids as string[];
      const nodes = ids
        .filter((id) => id !== 'deleted')
        .map((id) => ({ ...issueFixture.project, id, trashed: id === 'trashed' ? true : null }));
      return jsonResponse({ data: { projects: { nodes } } });
    };
    const fetch = scriptedFetch([issues, projects]);

    const result = await source(fetch).lookup(AUTH, ['issue'], {
      projectIds: ['kept', 'deleted', 'trashed'],
    });

    expect(fetch.requests[1].query).toMatch(/projects\(/);
    expect(fetch.requests[1].query).toMatch(/includeArchived: true/);
    expect(fetch.requests[1].variables.ids).toEqual(['kept', 'deleted', 'trashed']);
    expect(result.goneProjects).toEqual(['deleted', 'trashed']);
    expect(result.projects.map((project) => project.externalId).sort()).toEqual(
      [issueFixture.project.id, 'kept'].sort(),
    );
  });

  it('splits project ids into batches, with no issue request when there are no issue ids', async () => {
    const projectIds = Array.from({ length: LOOKUP_BATCH_SIZE + 1 }, (_, i) => `project-${i}`);
    const projects = (request: RecordedRequest) => {
      const nodes = (request.variables.ids as string[]).map((id) => ({
        ...issueFixture.project,
        id,
        trashed: null,
      }));
      return jsonResponse({ data: { projects: { nodes } } });
    };
    const fetch = scriptedFetch([projects, projects]);

    const result = await source(fetch).lookup(AUTH, [], { projectIds });

    expect(fetch.requests.map((request) => (request.variables.ids as string[]).length)).toEqual([
      LOOKUP_BATCH_SIZE,
      1,
    ]);
    expect(result.projects).toHaveLength(LOOKUP_BATCH_SIZE + 1);
    expect(result.goneProjects).toEqual([]);
  });

  it('counts a project that fails to validate as skipped, not gone', async () => {
    const projects = () =>
      jsonResponse({
        data: {
          projects: {
            nodes: [
              { ...issueFixture.project, id: 'odd', status: { type: 'unknown', name: 'Odd' } },
            ],
          },
        },
      });
    const fetch = scriptedFetch([projects]);

    const result = await source(fetch).lookup(AUTH, [], { projectIds: ['odd'] });

    expect(result).toMatchObject({ projects: [], goneProjects: [], skipped: 1 });
  });

  it('makes no request for an empty id list', async () => {
    const fetch = scriptedFetch([]);
    expect(await source(fetch).lookup(AUTH, [])).toEqual({
      tasks: [],
      projects: [],
      gone: [],
      goneProjects: [],
      skipped: 0,
    });
    expect(fetch.requests).toHaveLength(0);
  });
});

// responses recorded from a real account, then scrubbed; see the fixtures README
describe('Linear tasks — recorded responses', () => {
  it('maps a recorded page with nothing skipped', async () => {
    const fetch = scriptedFetch([{ body: recordedPageFixture }]);
    const page = await source(fetch).pull(AUTH, null, {});

    expect(page.skipped).toBe(0);
    expect(page.done).toBe(true);
    expect(page.tasks.map((task) => task.key)).toEqual(['MIT-18', 'MIT-135', 'MIT-35', 'MIT-14']);
    expect(page.tasks.every((task) => task.assignedToViewer)).toBe(true);
    expect(page.projects.map((project) => project.statusLabel)).toEqual([
      'Backlog',
      'Backlog',
      'In Progress',
    ]);

    const [due, child, started, noProject] = page.tasks;
    expect(due.dueDate).toEqual(new Date(2026, 6, 14));
    // Linear sends an empty description as "", which is stored as null
    expect(due.description).toBeNull();
    expect(child.parentKey).toBe('MIT-15');
    expect(started.statusLabel).toBe('In Progress');
    expect(noProject.projectExternalId).toBeNull();
  });

  it('maps recorded closed issues and reports a recorded trashed one as removed', async () => {
    const fetch = scriptedFetch([{ body: recordedClosedFixture }]);
    const page = await source(fetch).pull(AUTH, null, {});

    expect(page.skipped).toBe(0);
    // trashing archives the issue and sets trashed; it is reported, not mapped
    expect(page.removedIds).toEqual(['239caa4f-dce8-48a1-8d81-c6ce4c53c5c9']);
    const byKey = Object.fromEntries(page.tasks.map((task) => [task.key, task]));
    expect(Object.keys(byKey)).toEqual(['MIT-140', 'MIT-139', 'MIT-137', 'MIT-138']);

    expect(byKey['MIT-137']).toMatchObject({
      status: TaskStatus.COMPLETED,
      statusLabel: 'Done',
      priority: TaskPriority.HIGH,
      priorityLabel: 'Urgent',
      completedAt: new Date('2026-10-08T01:37:04.182Z'),
    });
    expect(byKey['MIT-138']).toMatchObject({
      status: TaskStatus.CANCELLED,
      priorityLabel: 'High',
      completedAt: null,
    });
    expect(byKey['MIT-139']).toMatchObject({
      status: TaskStatus.CANCELLED,
      statusLabel: 'Duplicate',
      priority: TaskPriority.MEDIUM,
      completedAt: null,
    });
    expect(byKey['MIT-140']).toMatchObject({
      status: TaskStatus.IN_PROGRESS,
      statusLabel: 'In Review',
      priority: TaskPriority.LOW,
      priorityLabel: 'Low',
      dueDate: new Date(2026, 9, 20),
    });
  });

  it('builds the account from a recorded viewer', async () => {
    const fetch = scriptedFetch([{ body: recordedViewerFixture }]);
    const account = await createLinearProvider({ fetch }).getAccount(AUTH);
    expect(account.label).toBe('Ada Lovelace, Acme');
    expect(account.accountId).toBe(
      '60549722-1bcb-494b-90dc-bb6ee9128bd5:49ecc4cf-4eab-4ad0-ba30-e4321299035a',
    );
  });
});
