import { describe, it, expect } from 'vitest';
import { AuthType } from '../../../integrations/types';
import { toAuth } from '../../../integrations/auth';
import { TaskSource } from '../../../integrations/providers/provider';
import { createLinearProvider } from '../../../integrations/providers/linear';
import { TaskPriority, TaskStatus } from '../../../tasks/types';
import { LOOKUP_BATCH_SIZE, PAGE_SIZE } from '../../../sync/constants';
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
const CLOSED_SINCE = '2026-09-07T12:00:00.000Z';

function source(fetch: ReturnType<typeof scriptedFetch>): TaskSource {
  return createLinearProvider({ fetch }).tasks!;
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

describe('Linear tasks — getAssignedTaskPage', () => {
  it('walks two pages by page token, reporting the trashed issue and the latest change', async () => {
    const fetch = scriptedFetch([{ body: page1Fixture }, { body: page2Fixture }]);
    const tasks = source(fetch);

    const first = await tasks.getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });
    expect(first.tasks.map((task) => task.key)).toEqual(['ENG-123', 'ENG-124']);
    expect(first.projects.map((project) => project.title)).toEqual(['Sync engine']);
    expect(first.trashedIds).toEqual([]);
    expect(first.latestChange).toBe('2026-10-05T16:45:00.000Z');
    expect(first.nextPageToken).toBe('cursor-page-1');

    const second = await tasks.getAssignedTaskPage(AUTH, {
      closedSince: CLOSED_SINCE,
      pageToken: 'cursor-page-1',
    });
    expect(second.tasks.map((task) => task.key)).toEqual(['ENG-205']);
    // the trashed issue is reported, not mapped
    expect(second.trashedIds).toEqual(['8f6a3c2e-1d4b-4e7a-9c0f-3b2a1e5d7e01']);
    // the trashed issue's change counts
    expect(second.latestChange).toBe('2026-10-06T09:00:00.000Z');
    expect(second.nextPageToken).toBeNull();

    const [request1, request2] = fetch.requests;
    expect(request1.variables.after).toBeNull();
    expect(request1.variables.first).toBe(PAGE_SIZE);
    expect(request2.variables.after).toBe('cursor-page-1');
    expect(request1.query).toMatch(/orderBy: updatedAt/);
    expect(request1.query).toMatch(/includeArchived: true/);
  });

  it('asks for open issues and those closed after closedSince', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });

    expect(fetch.requests[0].variables.filter).toEqual({
      or: [
        { state: { type: { nin: ['completed', 'canceled', 'duplicate'] } } },
        { completedAt: { gt: CLOSED_SINCE } },
        { canceledAt: { gt: CLOSED_SINCE } },
      ],
    });
  });

  it('asks for issues updated or archived since changedSince', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    const page = await source(fetch).getAssignedTaskPage(AUTH, {
      changedSince: '2026-10-06T00:00:00.000Z',
    });

    expect(fetch.requests[0].variables.filter).toEqual({
      or: [
        { updatedAt: { gt: '2026-10-06T00:00:00.000Z' } },
        { archivedAt: { gt: '2026-10-06T00:00:00.000Z' } },
      ],
    });
    // nothing came back: no change to report, and no next page
    expect(page.latestChange).toBeNull();
    expect(page.nextPageToken).toBeNull();
  });

  it('asks with no filter when the query has none', async () => {
    const fetch = scriptedFetch([{ body: issuesPage([]) }]);
    await source(fetch).getAssignedTaskPage(AUTH, {});
    expect(fetch.requests[0].variables.filter).toBeNull();
    expect(fetch.requests[0].variables.after).toBeNull();
  });

  it('reports a trashed issue, whose latest change is archivedAt though updatedAt is older', async () => {
    // as recorded live: trashing sets trashed and archivedAt, not updatedAt
    const trashed = {
      ...issueAt('t', '2026-10-05T09:00:00.000Z'),
      trashed: true,
      archivedAt: '2026-10-06T12:00:00.000Z',
    };
    const fetch = scriptedFetch([{ body: issuesPage([trashed]) }]);
    const page = await source(fetch).getAssignedTaskPage(AUTH, {
      changedSince: '2026-10-06T00:00:00.000Z',
    });

    expect(page.trashedIds).toEqual(['t']);
    expect(page.tasks).toEqual([]);
    expect(page.latestChange).toBe('2026-10-06T12:00:00.000Z');
  });

  it('reports the latest change on the page, whatever the order of its issues', async () => {
    const fetch = scriptedFetch([
      {
        body: issuesPage(
          [issueAt('a', '2026-10-07T10:00:00.000Z'), issueAt('b', '2026-10-06T10:00:00.000Z')],
          true,
          'c1',
        ),
      },
    ]);
    const page = await source(fetch).getAssignedTaskPage(AUTH, {});
    expect(page.latestChange).toBe('2026-10-07T10:00:00.000Z');
    expect(page.nextPageToken).toBe('c1');
  });

  it('skips and counts an issue that fails to validate, keeping the rest of the page', async () => {
    const bad = { ...issueFixture, id: 'bad', state: { name: 'Odd', type: 'someday' } };
    const fetch = scriptedFetch([{ body: issuesPage([bad, issueFixture]) }]);
    const page = await source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });
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
    const page = await source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });
    expect(page.tasks).toHaveLength(2);
    expect(page.projects).toHaveLength(1);
  });

  it('passes a rate limit through to the caller', async () => {
    const fetch = scriptedFetch([{ status: 400, body: rateLimitedFixture }]);
    await expect(
      source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe('Linear tasks — listOpenAssignedTaskIds', () => {
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

    expect(await source(fetch).listOpenAssignedTaskIds(AUTH)).toEqual(['a', 'b', 'c']);
    expect(fetch.requests.map((request) => request.variables.after)).toEqual([null, 'c1']);
    expect(fetch.requests[0].variables.filter).toEqual({
      state: { type: { nin: ['completed', 'canceled', 'duplicate'] } },
    });
    expect(fetch.requests[0].query).toMatch(/nodes\s*{\s*id\s*}/);
  });
});

describe('Linear tasks — resolveTasks and resolveProjects', () => {
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

    const result = await source(fetch).resolveTasks(AUTH, ids);

    expect(fetch.requests.map((request) => (request.variables.ids as string[]).length)).toEqual([
      LOOKUP_BATCH_SIZE,
      LOOKUP_BATCH_SIZE,
      50,
    ]);
    expect(fetch.requests[0].query).toMatch(/includeArchived: true/);
    expect(result.found).toHaveLength(247);
    expect(result.gone).toEqual(['issue-5', 'issue-150', 'issue-249']);
    expect(result.skipped).toBe(0);
  });

  it('marks a reassigned issue as not assigned to the viewer and a trashed one as gone', async () => {
    const respond = lookupResponder(new Set(), {
      reassigned: { assignee: { id: 'someone-else' } },
      trashed: { trashed: true },
    });
    const fetch = scriptedFetch([respond]);

    const result = await source(fetch).resolveTasks(AUTH, ['kept', 'reassigned', 'trashed']);

    expect(
      Object.fromEntries(result.found.map((task) => [task.externalId, task.assignedToViewer])),
    ).toEqual({ kept: true, reassigned: false });
    expect(result.gone).toEqual(['trashed']);
  });

  it('counts an issue that fails to validate as skipped, not gone', async () => {
    const respond = lookupResponder(new Set(), { odd: { priority: 9 } });
    const fetch = scriptedFetch([respond]);

    const result = await source(fetch).resolveTasks(AUTH, ['odd', 'fine']);

    expect(result.found.map((task) => task.externalId)).toEqual(['fine']);
    expect(result.gone).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('returns the projects of the issues it finds', async () => {
    const fetch = scriptedFetch([lookupResponder(new Set())]);

    const result = await source(fetch).resolveTasks(AUTH, ['a', 'b']);

    // both issues are in the fixture's project, which comes back once
    expect(result.projects.map((project) => project.externalId)).toEqual([issueFixture.project.id]);
    expect(result.gone).toEqual([]);
  });

  it('drops duplicate ids before asking', async () => {
    const fetch = scriptedFetch([lookupResponder(new Set())]);

    const result = await source(fetch).resolveTasks(AUTH, ['a', 'a', 'b']);

    expect(fetch.requests[0].variables.ids).toEqual(['a', 'b']);
    expect(result.found.map((task) => task.externalId)).toEqual(['a', 'b']);
  });

  it('resolves projects, reporting missing and trashed ones as gone and archived ones found', async () => {
    const projects = (request: RecordedRequest) => {
      const ids = request.variables.ids as string[];
      const nodes = ids
        .filter((id) => id !== 'deleted')
        .map((id) => ({
          ...issueFixture.project,
          id,
          trashed: id === 'trashed' ? true : null,
          ...(id === 'archived' && { archivedAt: '2026-10-01T00:00:00.000Z' }),
        }));
      return jsonResponse({ data: { projects: { nodes } } });
    };
    const fetch = scriptedFetch([projects]);

    const result = await source(fetch).resolveProjects(AUTH, [
      'kept',
      'deleted',
      'trashed',
      'archived',
    ]);

    expect(fetch.requests[0].query).toMatch(/projects\(/);
    expect(fetch.requests[0].query).toMatch(/includeArchived: true/);
    expect(fetch.requests[0].variables.ids).toEqual(['kept', 'deleted', 'trashed', 'archived']);
    expect(result.gone).toEqual(['deleted', 'trashed']);
    expect(result.found.map((project) => project.externalId)).toEqual(['kept', 'archived']);
  });

  it('splits project ids into batches', async () => {
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

    const result = await source(fetch).resolveProjects(AUTH, projectIds);

    expect(fetch.requests.map((request) => (request.variables.ids as string[]).length)).toEqual([
      LOOKUP_BATCH_SIZE,
      1,
    ]);
    expect(result.found).toHaveLength(LOOKUP_BATCH_SIZE + 1);
    expect(result.gone).toEqual([]);
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

    const result = await source(fetch).resolveProjects(AUTH, ['odd']);

    expect(result).toEqual({ found: [], gone: [], skipped: 1 });
  });

  it('makes no request for an empty id list', async () => {
    const fetch = scriptedFetch([]);
    expect(await source(fetch).resolveTasks(AUTH, [])).toEqual({
      found: [],
      projects: [],
      gone: [],
      skipped: 0,
    });
    expect(await source(fetch).resolveProjects(AUTH, [])).toEqual({
      found: [],
      gone: [],
      skipped: 0,
    });
    expect(fetch.requests).toHaveLength(0);
  });
});

// responses recorded from a real account, then scrubbed; see the fixtures README
describe('Linear tasks — recorded responses', () => {
  it('maps a recorded page with nothing skipped', async () => {
    const fetch = scriptedFetch([{ body: recordedPageFixture }]);
    const page = await source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });

    expect(page.skipped).toBe(0);
    expect(page.nextPageToken).toBeNull();
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
    const page = await source(fetch).getAssignedTaskPage(AUTH, { closedSince: CLOSED_SINCE });

    expect(page.skipped).toBe(0);
    // trashing archives the issue and sets trashed; it is reported, not mapped
    expect(page.trashedIds).toEqual(['239caa4f-dce8-48a1-8d81-c6ce4c53c5c9']);
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
