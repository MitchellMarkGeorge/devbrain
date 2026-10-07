import { ExternalProject, ExternalTask, LinearTaskCursor } from '../../types';
import { linearTaskCursorSchema } from '../../schema';
import { Auth } from '../../auth';
import { LookupResult, SyncCursor, TaskPage, TaskSource } from '../provider';
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
  initialIssuesFilter,
  openIssuesFilter,
  updatedIssuesFilter,
} from './queries';
import {
  AssignedIssueIdsResponse,
  LinearIssue,
  assignedIssueIdsResponseSchema,
  assignedIssuesResponseSchema,
  issuesByIdResponseSchema,
  linearIssueSchema,
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
        : updatedIssuesFilter(current.updatedSince);

    const { viewer } = await this.client.request(
      auth,
      ASSIGNED_ISSUES_QUERY,
      { first: PAGE_SIZE, after: current.after ?? null, filter },
      assignedIssuesResponseSchema,
    );
    const { pageInfo, nodes } = viewer.assignedIssues;

    const page = mapIssues(nodes, viewer.id);
    let maxUpdatedAt = current.maxUpdatedAt ?? null;
    for (const updatedAt of page.updatedAts) {
      if (maxUpdatedAt === null || updatedAt > maxUpdatedAt) {
        maxUpdatedAt = updatedAt;
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
    for (;;) {
      const response: AssignedIssueIdsResponse = await this.client.request(
        auth,
        ASSIGNED_ISSUE_IDS_QUERY,
        { first: PAGE_SIZE, after, filter: openIssuesFilter() },
        assignedIssueIdsResponseSchema,
      );
      const { pageInfo, nodes } = response.viewer.assignedIssues;
      ids.push(...nodes.map((node) => node.id));
      if (!pageInfo.hasNextPage || pageInfo.endCursor === null) {
        return ids;
      }
      after = pageInfo.endCursor;
    }
  }

  async lookup(auth: Auth, externalIds: string[]): Promise<LookupResult> {
    const ids = [...new Set(externalIds)];
    const tasks: ExternalTask[] = [];
    const gone: string[] = [];
    let skipped = 0;

    for (let start = 0; start < ids.length; start += LOOKUP_BATCH_SIZE) {
      const batch = ids.slice(start, start + LOOKUP_BATCH_SIZE);
      const { viewer, issues } = await this.client.request(
        auth,
        ISSUES_BY_ID_QUERY,
        { first: batch.length, ids: batch },
        issuesByIdResponseSchema,
      );
      const page = mapIssues(issues.nodes, viewer.id);
      tasks.push(...page.tasks);
      skipped += page.skipped;

      // an id that did not come back, or came back trashed, is gone; one that came back but
      // failed to map is neither found nor gone
      const seen = new Set([...page.tasks.map((task) => task.externalId), ...page.unmappedIds]);
      gone.push(...batch.filter((id) => !seen.has(id)));
    }
    return { tasks, gone, skipped };
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
  // updatedAt of every valid node, normalised to UTC ISO strings so they compare as text
  updatedAts: string[];
  skipped: number;
}

// validates and maps nodes one by one, so a bad node is skipped instead of failing the page
function mapIssues(nodes: unknown[], viewerId: string): MappedIssues {
  const result: MappedIssues = {
    tasks: [],
    projects: [],
    trashedIds: [],
    unmappedIds: [],
    updatedAts: [],
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
    result.updatedAts.push(new Date(issue.updatedAt).toISOString());
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

function readId(node: unknown): string | null {
  if (typeof node === 'object' && node !== null && 'id' in node && typeof node.id === 'string') {
    return node.id;
  }
  return null;
}
