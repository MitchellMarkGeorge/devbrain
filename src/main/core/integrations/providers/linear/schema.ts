import { z } from 'zod';
import { TaskPriority, TaskStatus } from '../../../tasks/types';
import { ProjectStatus } from '../../../projects/types';

// What Linear sends back: enum values and their DevBrain mappings, and the response shapes the
// client validates against. The queries that ask for these fields are in ./queries. Field names
// and enum values are checked against the schema types in @linear/sdk; what still needs a live
// account is listed in tests/integrations/fixtures/linear/README.md.

// workflow state type -> DevBrain status
export const STATE_TYPE_STATUS: Record<string, TaskStatus> = {
  triage: TaskStatus.NOT_STARTED,
  backlog: TaskStatus.NOT_STARTED,
  unstarted: TaskStatus.NOT_STARTED,
  started: TaskStatus.IN_PROGRESS,
  completed: TaskStatus.COMPLETED,
  canceled: TaskStatus.CANCELLED,
  // an issue closed as a duplicate of another
  duplicate: TaskStatus.CANCELLED,
};
// the state types that close an issue
export const CLOSED_STATE_TYPES = ['completed', 'canceled', 'duplicate'];

// priority number -> DevBrain priority; 0 is "No priority"
export const PRIORITY: Record<number, TaskPriority> = {
  0: TaskPriority.LOW,
  1: TaskPriority.HIGH, // urgent
  2: TaskPriority.HIGH,
  3: TaskPriority.MEDIUM,
  4: TaskPriority.LOW,
};

// project status type -> DevBrain project status
export const PROJECT_STATUS_TYPE_STATUS: Record<string, ProjectStatus> = {
  backlog: ProjectStatus.NOT_STARTED,
  planned: ProjectStatus.NOT_STARTED,
  started: ProjectStatus.ACTIVE,
  paused: ProjectStatus.ON_HOLD,
  completed: ProjectStatus.COMPLETED,
  canceled: ProjectStatus.COMPLETED,
};

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
  // the type drives the mapping; the name is the team's own label, e.g. "In Progress"
  status: z.object({
    type: z.enum(Object.keys(PROJECT_STATUS_TYPE_STATUS) as [string, ...string[]]),
    name: z.string(),
  }),
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
