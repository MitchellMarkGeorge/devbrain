import { ExternalProject, ExternalTask } from '../../types';
import { Auth } from '../../auth';
import {
  AssignedTaskPage,
  AssignedTasksQuery,
  Resolution,
  TaskResolution,
  TaskSource,
} from '../provider';
import { LOOKUP_BATCH_SIZE, PAGE_SIZE } from '../../../sync/constants';
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

// The viewer's assigned Linear issues as a task source: the queries, their filters, and the
// mapping of what comes back. Which query a sync asks, and where it resumes, is TaskSyncer's.
export class LinearTaskSource implements TaskSource {
  constructor(private readonly client: LinearClient) {}

  /**
   * One page of the viewer's assigned issues, ordered by updatedAt and including archived ones,
   * so a trashed issue comes back and is reported in trashedIds.
   *
   * - closedSince: open issues at any age, plus those completed or canceled after it
   * - changedSince: issues updated or archived after it; trashing archives an issue without
   *   changing updatedAt, so archivedAt is checked too
   * - neither: every assigned issue
   */
  async getAssignedTaskPage(auth: Auth, query: AssignedTasksQuery): Promise<AssignedTaskPage> {
    const filter =
      query.changedSince !== undefined
        ? changedIssuesFilter(query.changedSince)
        : query.closedSince !== undefined
          ? initialIssuesFilter(query.closedSince)
          : null;

    const { viewer } = await this.client.request(
      auth,
      ASSIGNED_ISSUES_QUERY,
      { first: PAGE_SIZE, after: query.pageToken ?? null, filter },
      assignedIssuesResponseSchema,
    );
    const { pageInfo, nodes } = viewer.assignedIssues;

    const page = mapIssues(nodes, viewer.id);
    // the latest change on the page, archiving included
    let latestChange: string | null = null;
    for (const changedAt of page.changedAts) {
      if (latestChange === null || changedAt > latestChange) latestChange = changedAt;
    }

    return {
      tasks: page.tasks,
      projects: page.projects,
      trashedIds: page.trashedIds,
      skipped: page.skipped,
      latestChange,
      nextPageToken: pageInfo.hasNextPage ? pageInfo.endCursor : null,
    };
  }

  async listOpenAssignedTaskIds(auth: Auth): Promise<string[]> {
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
   * The current state of specific issues, by id.
   *
   * 1. Drop duplicate ids and split them into batches of LOOKUP_BATCH_SIZE, one request each. The
   *    query passes includeArchived, so trashed and archived issues still come back and a trashed
   *    issue can be told apart from a deleted one. The same request asks for the viewer's id, to
   *    compare with each issue's assignee.
   * 2. Sort each requested id into exactly one bucket:
   *    - found: valid and not trashed. Mapped like a listed issue, with assignedToViewer set from
   *      its assignee, and its project collected
   *    - gone: not in the response (Linear leaves out ids that no longer exist), or trashed
   *    - skipped: in the response but failed to validate. Counted, and never reported as gone
   *
   * Empty input makes no request.
   */
  async resolveTasks(auth: Auth, ids: string[]): Promise<TaskResolution> {
    const found: ExternalTask[] = [];
    const projects = new Map<string, ExternalProject>();
    const gone: string[] = [];
    let skipped = 0;

    // 1.
    for (const batch of batches([...new Set(ids)])) {
      const { viewer, issues } = await this.client.request(
        auth,
        ISSUES_BY_ID_QUERY,
        { first: batch.length, ids: batch },
        issuesByIdResponseSchema,
      );
      // 2. mapIssues validates node by node, and leaves trashed issues out of page.tasks
      const page = mapIssues(issues.nodes, viewer.id);
      found.push(...page.tasks);
      page.projects.forEach((project) => projects.set(project.externalId, project));
      skipped += page.skipped;

      // an id that did not come back, or came back trashed, is gone; one that came back but
      // failed to map is neither found nor gone
      const seen = new Set([...page.tasks.map((task) => task.externalId), ...page.unmappedIds]);
      gone.push(...batch.filter((id) => !seen.has(id)));
    }

    return { found, projects: [...projects.values()], gone, skipped };
  }

  /**
   * The current state of specific projects, by id: the same batching and the same three buckets
   * as resolveTasks, through the projects query. An archived project that is not trashed still
   * exists, so it is found. Empty input makes no request.
   */
  async resolveProjects(auth: Auth, ids: string[]): Promise<Resolution<ExternalProject>> {
    const found = new Map<string, ExternalProject>();
    const gone: string[] = [];
    let skipped = 0;

    for (const batch of batches([...new Set(ids)])) {
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
        found.set(parsed.data.id, toExternalProject(parsed.data));
      }
      gone.push(...batch.filter((id) => !seen.has(id)));
    }

    return { found: [...found.values()], gone, skipped };
  }
}

interface MappedIssues {
  tasks: ExternalTask[];
  projects: ExternalProject[];
  trashedIds: string[];
  // ids of nodes that failed to validate or map, when the node had a readable id
  unmappedIds: string[];
  // when each valid node last changed: the later of updatedAt and archivedAt, as UTC ISO strings
  // so they compare as text. Without archivedAt, a sync that resumes from the latest change would
  // fetch a trashed issue again every run.
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
