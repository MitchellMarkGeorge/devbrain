import { ExternalProject, ExternalTask, LinearTaskCursor } from '../../types';
import { linearTaskCursorSchema } from '../../schema';
import { Auth } from '../../auth';
import { LookupOptions, LookupResult, SyncCursor, TaskPage, TaskSource } from '../provider';
import {
  CLOSED_ISSUE_WINDOW_MS,
  CURSOR_OVERLAP_MS,
  LOOKUP_BATCH_SIZE,
  PAGE_SIZE,
} from '../../../sync/constants';
import { LinearClient } from './client';
import { toExternalProject, toExternalTask } from './mapper';
import {
  ASSIGNED_ISSUE_IDS_QUERY,
  ASSIGNED_ISSUES_QUERY,
  ISSUES_BY_ID_QUERY,
  PROJECTS_BY_ID_QUERY,
  initialIssuesFilter,
  openIssuesFilter,
  changedIssuesFilter,
} from './queries';
import {
  AssignedIssueIdsResponse,
  LinearIssue,
  assignedIssueIdsResponseSchema,
  assignedIssuesResponseSchema,
  issuesByIdResponseSchema,
  linearIssueSchema,
  linearProjectNodeSchema,
  projectsByIdResponseSchema,
} from './schema';

// The viewer's assigned issues as a task source. Initial mode walks open issues and those closed
// in the last 30 days; incremental mode walks issues updated since the cursor. Both order by
// updatedAt and track the highest one seen, which becomes the next incremental cursor.
export class LinearTaskSource implements TaskSource {
  constructor(
    private readonly client: LinearClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async pull(auth: Auth, cursor: SyncCursor | null): Promise<TaskPage> {
    const current = this.readCursor(cursor);
    const filter =
      current.mode === 'initial'
        ? initialIssuesFilter(this.isoAgo(CLOSED_ISSUE_WINDOW_MS))
        : changedIssuesFilter(current.updatedSince);

    const { viewer } = await this.client.request(
      auth,
      ASSIGNED_ISSUES_QUERY,
      { first: PAGE_SIZE, after: current.after ?? null, filter },
      assignedIssuesResponseSchema,
    );
    const { pageInfo, nodes } = viewer.assignedIssues;

    const page = mapIssues(nodes, viewer.id);
    // the cursor's maxUpdatedAt tracks the latest change seen, archiving included
    let maxUpdatedAt = current.maxUpdatedAt ?? null;
    for (const changedAt of page.changedAts) {
      if (maxUpdatedAt === null || changedAt > maxUpdatedAt) {
        maxUpdatedAt = changedAt;
      }
    }

    const done = !pageInfo.hasNextPage || pageInfo.endCursor === null;
    return {
      tasks: page.tasks,
      projects: page.projects,
      removedIds: page.trashedIds,
      nextCursor: done
        ? this.nextIncremental(current, maxUpdatedAt)
        : this.nextPage(current, pageInfo.endCursor!, maxUpdatedAt),
      done,
      skipped: page.skipped,
    };
  }

  async listAssignedIds(auth: Auth): Promise<string[]> {
    const ids: string[] = [];
    let after: string | null = null;
    // one request per page; whether there is another page is only known from each response
    do {
      const response: AssignedIssueIdsResponse = await this.client.request(
        auth,
        ASSIGNED_ISSUE_IDS_QUERY,
        { first: PAGE_SIZE, after, filter: openIssuesFilter() },
        assignedIssueIdsResponseSchema,
      );
      const { pageInfo, nodes } = response.viewer.assignedIssues;
      ids.push(...nodes.map((node) => node.id));
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after !== null);
    return ids;
  }

  /**
   * The current state of specific issues and, optionally, projects, by id. Reconcile uses it to
   * find out what happened to items the assignment snapshot no longer lists (and to those it lists
   * again). It writes nothing; SyncWriter decides what each result means.
   *
   * 1. Issues: drop duplicate ids and split them into batches of LOOKUP_BATCH_SIZE, one request
   *    each. The query passes includeArchived, so trashed and archived issues still come back and
   *    a trashed issue can be told apart from a deleted one. The same request asks for the viewer's
   *    id, to compare with each issue's assignee.
   * 2. Sort each requested issue id into exactly one bucket:
   *    - found: valid and not trashed. Mapped like a pulled issue, with assignedToViewer set from
   *      its assignee, and its project collected
   *    - gone: not in the response (Linear leaves out ids that no longer exist), or trashed
   *    - skipped: in the response but failed to validate. Counted, and never reported as gone, so
   *      a schema mismatch on our side cannot make an issue look deleted
   * 3. Projects, only for `options.projectIds`: the same batching and the same three buckets,
   *    through the projects query. An archived project that is not trashed still exists, so it is
   *    found.
   *
   * Returns:
   * - tasks: the found issues. assignedToViewer false means reassigned away
   * - projects: the found issues' projects, then the found requested projects, each once
   * - gone, goneProjects: the ids that no longer resolve or are trashed
   * - skipped: issues and projects that came back but could not be read
   *
   * Empty inputs make no request.
   */
  async lookup(
    auth: Auth,
    externalIds: string[],
    options: LookupOptions = {},
  ): Promise<LookupResult> {
    const ids = [...new Set(externalIds)];
    const tasks: ExternalTask[] = [];
    const projects = new Map<string, ExternalProject>();
    const gone: string[] = [];
    let skipped = 0;

    // 1.
    for (const batch of batches(ids)) {
      const { viewer, issues } = await this.client.request(
        auth,
        ISSUES_BY_ID_QUERY,
        { first: batch.length, ids: batch },
        issuesByIdResponseSchema,
      );
      // 2. mapIssues validates node by node, and leaves trashed issues out of page.tasks
      const page = mapIssues(issues.nodes, viewer.id);
      tasks.push(...page.tasks);
      page.projects.forEach((project) => projects.set(project.externalId, project));
      skipped += page.skipped;

      // an id that did not come back, or came back trashed, is gone; one that came back but
      // failed to map is neither found nor gone
      const seen = new Set([...page.tasks.map((task) => task.externalId), ...page.unmappedIds]);
      gone.push(...batch.filter((id) => !seen.has(id)));
    }

    // 3.
    const goneProjects: string[] = [];
    for (const batch of batches([...new Set(options.projectIds ?? [])])) {
      const response = await this.client.request(
        auth,
        PROJECTS_BY_ID_QUERY,
        { first: batch.length, ids: batch },
        projectsByIdResponseSchema,
      );
      // the same rule as issues: missing or trashed is gone, unreadable is neither
      const seen = new Set<string>();
      for (const node of response.projects.nodes) {
        const parsed = linearProjectNodeSchema.safeParse(node);
        if (!parsed.success) {
          skipped++;
          const id = readId(node);
          if (id !== null) seen.add(id);
          continue;
        }
        if (parsed.data.trashed) continue;
        seen.add(parsed.data.id);
        projects.set(parsed.data.id, toExternalProject(parsed.data));
      }
      goneProjects.push(...batch.filter((id) => !seen.has(id)));
    }

    return { tasks, projects: [...projects.values()], gone, goneProjects, skipped };
  }

  private readCursor(cursor: SyncCursor | null): LinearTaskCursor {
    const parsed = linearTaskCursorSchema.safeParse(cursor);
    // a missing or unreadable cursor starts a fresh initial sync
    return parsed.success ? parsed.data : { mode: 'initial', after: null, maxUpdatedAt: null };
  }

  private nextPage(
    current: LinearTaskCursor,
    after: string,
    maxUpdatedAt: string | null,
  ): LinearTaskCursor {
    if (current.mode === 'initial') {
      return { mode: 'initial', after, maxUpdatedAt };
    }
    // updatedSince stays fixed until the last page, so the walk sees a stable result set
    return {
      mode: 'incremental',
      updatedSince: current.updatedSince,
      after,
      ...(maxUpdatedAt !== null && { maxUpdatedAt }),
    };
  }

  // after the last page: changes since the highest updatedAt seen, minus the overlap
  private nextIncremental(
    current: LinearTaskCursor,
    maxUpdatedAt: string | null,
  ): LinearTaskCursor {
    if (maxUpdatedAt === null) {
      // nothing seen: keep the incremental cursor, or start from now after an empty initial sync
      return {
        mode: 'incremental',
        updatedSince:
          current.mode === 'incremental' ? current.updatedSince : this.isoAgo(CURSOR_OVERLAP_MS),
      };
    }
    let since = new Date(new Date(maxUpdatedAt).getTime() - CURSOR_OVERLAP_MS).toISOString();
    // never move the cursor backwards
    if (current.mode === 'incremental' && since < current.updatedSince) {
      since = current.updatedSince;
    }
    return { mode: 'incremental', updatedSince: since };
  }

  private isoAgo(ms: number): string {
    return new Date(this.now().getTime() - ms).toISOString();
  }
}

interface MappedIssues {
  tasks: ExternalTask[];
  projects: ExternalProject[];
  trashedIds: string[];
  // ids of nodes that failed to validate or map, when the node had a readable id
  unmappedIds: string[];
  // when each valid node last changed: the later of updatedAt and archivedAt, as UTC ISO strings
  // so they compare as text. Without archivedAt a trashed issue would be fetched again every run.
  changedAts: string[];
  skipped: number;
}

// validates and maps nodes one by one, so a bad node is skipped instead of failing the page
function mapIssues(nodes: unknown[], viewerId: string): MappedIssues {
  const result: MappedIssues = {
    tasks: [],
    projects: [],
    trashedIds: [],
    unmappedIds: [],
    changedAts: [],
    skipped: 0,
  };
  const projects = new Map<string, ExternalProject>();

  for (const node of nodes) {
    const parsed = linearIssueSchema.safeParse(node);
    if (!parsed.success) {
      result.skipped++;
      const id = readId(node);
      if (id !== null) {
        result.unmappedIds.push(id);
      }
      continue;
    }
    const issue: LinearIssue = parsed.data;
    result.changedAts.push(changedAt(issue));
    if (issue.trashed) {
      result.trashedIds.push(issue.id);
      continue;
    }
    result.tasks.push(toExternalTask(issue, viewerId));
    if (issue.project && !projects.has(issue.project.id)) {
      projects.set(issue.project.id, toExternalProject(issue.project));
    }
  }

  result.projects = [...projects.values()];
  return result;
}

// ids in lookup-sized batches
function batches(ids: string[]): string[][] {
  const result: string[][] = [];
  for (let start = 0; start < ids.length; start += LOOKUP_BATCH_SIZE) {
    result.push(ids.slice(start, start + LOOKUP_BATCH_SIZE));
  }
  return result;
}

function readId(node: unknown): string | null {
  if (typeof node === 'object' && node !== null && 'id' in node && typeof node.id === 'string') {
    return node.id;
  }
  return null;
}

function changedAt(issue: LinearIssue): string {
  const updatedAt = new Date(issue.updatedAt).getTime();
  const archivedAt = issue.archivedAt === null ? 0 : new Date(issue.archivedAt).getTime();
  return new Date(Math.max(updatedAt, archivedAt)).toISOString();
}
