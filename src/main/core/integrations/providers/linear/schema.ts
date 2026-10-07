import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../../../tasks/types';
import { ProjectStatus } from '../../../projects/types';

// Everything this adapter knows about Linear's schema: field names, enum values and query
// documents. Several are from memory and still to be confirmed against the live API (see
// tests/integrations/fixtures/linear/README.md), so they are kept together here: a correction
// after a live check is a change to this file only.

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export const RATE_LIMITED_CODE = 'RATELIMITED';
// from memory: an unknown or revoked key may come back as a 400 with this code instead of a 401
export const AUTHENTICATION_ERROR_CODE = 'AUTHENTICATION_ERROR';
export const RATE_LIMIT_RESET_HEADERS = [
  'X-RateLimit-Requests-Reset',
  'X-RateLimit-Complexity-Reset',
];

// workflow state type -> DevBrain status
export const STATE_TYPE_STATUS: Record<string, TaskStatus> = {
  triage: TaskStatus.NOT_STARTED,
  backlog: TaskStatus.NOT_STARTED,
  unstarted: TaskStatus.NOT_STARTED,
  started: TaskStatus.IN_PROGRESS,
  completed: TaskStatus.COMPLETED,
  canceled: TaskStatus.CANCELLED,
};
// the state types that close an issue
export const CLOSED_STATE_TYPES = ['completed', 'canceled'];

// priority number -> DevBrain priority; 0 is "No priority"
export const PRIORITY: Record<number, TaskPriority> = {
  0: TaskPriority.LOW,
  1: TaskPriority.HIGH, // urgent
  2: TaskPriority.HIGH,
  3: TaskPriority.MEDIUM,
  4: TaskPriority.LOW,
};

// project state -> DevBrain project status
export const PROJECT_STATE_STATUS: Record<string, ProjectStatus> = {
  backlog: ProjectStatus.NOT_STARTED,
  planned: ProjectStatus.NOT_STARTED,
  started: ProjectStatus.ACTIVE,
  paused: ProjectStatus.ON_HOLD,
  completed: ProjectStatus.COMPLETED,
  canceled: ProjectStatus.COMPLETED,
};

const PROJECT_FIELDS = `
  id
  name
  description
  url
  state
  startDate
  targetDate
  color
  completedAt
  canceledAt
  createdAt
  updatedAt
`;

const ISSUE_FIELDS = `
  id
  identifier
  url
  title
  description
  priority
  priorityLabel
  dueDate
  startedAt
  completedAt
  canceledAt
  createdAt
  updatedAt
  archivedAt
  trashed
  state { name type }
  assignee { id }
  parent { id identifier title }
  project { ${PROJECT_FIELDS} }
`;

export const VIEWER_QUERY = `
  query Viewer {
    viewer { id name email organization { id name } }
  }
`;

// one page of the viewer's assigned issues; the filter differs between initial and incremental
export const ASSIGNED_ISSUES_QUERY = `
  query AssignedIssues($first: Int!, $after: String, $filter: IssueFilter) {
    viewer {
      id
      assignedIssues(
        first: $first
        after: $after
        orderBy: updatedAt
        includeArchived: true
        filter: $filter
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }
`;

export const ASSIGNED_ISSUE_IDS_QUERY = `
  query AssignedIssueIds($first: Int!, $after: String, $filter: IssueFilter) {
    viewer {
      assignedIssues(first: $first, after: $after, filter: $filter) {
        pageInfo { hasNextPage endCursor }
        nodes { id }
      }
    }
  }
`;

export const ISSUES_BY_ID_QUERY = `
  query IssuesById($first: Int!, $ids: [ID!]!) {
    viewer { id }
    issues(first: $first, includeArchived: true, filter: { id: { in: $ids } }) {
      nodes { ${ISSUE_FIELDS} }
    }
  }
`;

// filters, as IssueFilter variables

export function openIssuesFilter() {
  return { state: { type: { nin: CLOSED_STATE_TYPES } } };
}

// open at any age, or closed after `closedSince`
export function initialIssuesFilter(closedSince: string) {
  return {
    or: [
      openIssuesFilter(),
      { completedAt: { gt: closedSince } },
      { canceledAt: { gt: closedSince } },
    ],
  };
}

export function updatedIssuesFilter(updatedSince: string) {
  return { updatedAt: { gt: updatedSince } };
}

// response shapes. Nodes are kept as unknown here and validated one by one, so a single bad item
// is skipped instead of failing the page.

const dateTime = z.iso.datetime({ offset: true });
// a date with no time, e.g. "2026-10-07"
const dateOnly = z.iso.date();

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const connectionSchema = z.object({
  pageInfo: pageInfoSchema,
  nodes: z.array(z.unknown()),
});

export const viewerResponseSchema = z.object({
  viewer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    organization: z.object({ id: z.string(), name: z.string() }),
  }),
});

export const assignedIssuesResponseSchema = z.object({
  viewer: z.object({ id: z.string(), assignedIssues: connectionSchema }),
});

export const assignedIssueIdsResponseSchema = z.object({
  viewer: z.object({
    assignedIssues: z.object({
      pageInfo: pageInfoSchema,
      nodes: z.array(z.object({ id: z.string() })),
    }),
  }),
});

export const issuesByIdResponseSchema = z.object({
  viewer: z.object({ id: z.string() }),
  issues: z.object({ nodes: z.array(z.unknown()) }),
});

export const linearProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  state: z.enum(Object.keys(PROJECT_STATE_STATUS) as [string, ...string[]]),
  startDate: dateOnly.nullable(),
  targetDate: dateOnly.nullable(),
  color: z.string().nullable(),
  completedAt: dateTime.nullable(),
  canceledAt: dateTime.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
});

export const linearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z
    .number()
    .int()
    .refine((value) => value in PRIORITY, 'unknown priority'),
  priorityLabel: z.string().nullable(),
  dueDate: dateOnly.nullable(),
  startedAt: dateTime.nullable(),
  completedAt: dateTime.nullable(),
  canceledAt: dateTime.nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
  archivedAt: dateTime.nullable(),
  trashed: z.boolean().nullable(),
  state: z.object({
    name: z.string(),
    type: z.enum(Object.keys(STATE_TYPE_STATUS) as [string, ...string[]]),
  }),
  assignee: z.object({ id: z.string() }).nullable(),
  parent: z.object({ id: z.string(), identifier: z.string(), title: z.string() }).nullable(),
  project: linearProjectSchema.nullable(),
});

export type AssignedIssueIdsResponse = z.infer<typeof assignedIssueIdsResponseSchema>;
export type LinearIssue = z.infer<typeof linearIssueSchema>;
export type LinearProject = z.infer<typeof linearProjectSchema>;
