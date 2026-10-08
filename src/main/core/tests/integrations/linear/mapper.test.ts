import { describe, it, expect } from 'vitest';
import { TaskPriority, TaskStatus } from '../../../tasks/types';
import { ProjectStatus } from '../../../projects/types';
import { toExternalProject, toExternalTask } from '../../../integrations/providers/linear/mapper';
import {
  LinearIssue,
  linearIssueSchema,
  linearProjectSchema,
} from '../../../integrations/providers/linear/schema';
import issueFixture from '../fixtures/linear/issue.json';
import minimalFixture from '../fixtures/linear/issue-minimal.json';
import byStateFixture from '../fixtures/linear/issues-by-state.json';

const VIEWER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

// parsing also checks that each hand-written fixture matches the schema the client validates with
const issue = (node: unknown = issueFixture): LinearIssue => linearIssueSchema.parse(node);

describe('Linear mapper — issues', () => {
  it('maps every mirrored field', () => {
    expect(toExternalTask(issue(), VIEWER_ID)).toEqual({
      externalId: '8f6a3c2e-1d4b-4e7a-9c0f-3b2a1e5d7c01',
      key: 'ENG-123',
      url: 'https://linear.app/acme/issue/ENG-123/write-the-linear-mapper',
      title: 'Write the Linear mapper',
      description: 'Map issues to **ExternalTask**.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      statusLabel: 'In Review',
      priorityLabel: 'High',
      startDate: new Date('2026-10-02T08:30:00.000Z'),
      dueDate: new Date(2026, 9, 20),
      completedAt: null,
      createdAt: new Date('2026-09-28T10:00:00.000Z'),
      updatedAt: new Date('2026-10-05T16:45:00.000Z'),
      parentExternalId: '8f6a3c2e-1d4b-4e7a-9c0f-3b2a1e5d7c00',
      parentKey: 'ENG-100',
      parentTitle: 'Linear sync',
      projectExternalId: '5d2c9e1a-7b40-4c61-9f3e-2a8d1b6c0e01',
      assignedToViewer: true,
    });
  });

  it.each([
    ['triage', TaskStatus.NOT_STARTED, 'Triage'],
    ['backlog', TaskStatus.NOT_STARTED, 'Backlog'],
    ['unstarted', TaskStatus.NOT_STARTED, 'Todo'],
    ['started', TaskStatus.IN_PROGRESS, 'In Progress'],
    ['completed', TaskStatus.COMPLETED, 'Done'],
    ['canceled', TaskStatus.CANCELLED, 'Canceled'],
    ['duplicate', TaskStatus.CANCELLED, 'Duplicate'],
  ] as const)('maps state type %s by type, keeping the team label', (type, status, label) => {
    const task = toExternalTask(issue(byStateFixture[type]), VIEWER_ID);
    expect(task.status).toBe(status);
    expect(task.statusLabel).toBe(label);
  });

  it('takes completedAt from Linear for a completed issue only', () => {
    expect(toExternalTask(issue(byStateFixture.completed), VIEWER_ID).completedAt).toEqual(
      new Date('2026-10-04T15:00:00.000Z'),
    );
    // cancelled closes the task but never sets completedAt
    expect(toExternalTask(issue(byStateFixture.canceled), VIEWER_ID).completedAt).toBeNull();
    expect(toExternalTask(issue(byStateFixture.duplicate), VIEWER_ID).completedAt).toBeNull();
    expect(toExternalTask(issue(byStateFixture.started), VIEWER_ID).completedAt).toBeNull();
  });

  it('maps an archived closed issue like any other', () => {
    const task = toExternalTask(issue(byStateFixture.canceled), VIEWER_ID);
    expect(task.status).toBe(TaskStatus.CANCELLED);
    expect(task.assignedToViewer).toBe(true);
  });

  it.each([
    [0, 'No priority', TaskPriority.LOW],
    [1, 'Urgent', TaskPriority.HIGH],
    [2, 'High', TaskPriority.HIGH],
    [3, 'Medium', TaskPriority.MEDIUM],
    [4, 'Low', TaskPriority.LOW],
  ])('maps priority %i (%s) and keeps the raw label', (priority, priorityLabel, expected) => {
    const task = toExternalTask(issue({ ...issueFixture, priority, priorityLabel }), VIEWER_ID);
    expect(task.priority).toBe(expected);
    expect(task.priorityLabel).toBe(priorityLabel);
  });

  it('maps an issue with no due date, project, parent or description', () => {
    const task = toExternalTask(issue(minimalFixture), VIEWER_ID);
    expect(task.dueDate).toBeNull();
    expect(task.startDate).toBeNull();
    expect(task.projectExternalId).toBeNull();
    expect(task.parentExternalId).toBeNull();
    expect(task.parentKey).toBeNull();
    expect(task.parentTitle).toBeNull();
    expect(task.description).toBeNull();
    expect(task.status).toBe(TaskStatus.NOT_STARTED);
  });

  it('stores the date-only due date as local midnight', () => {
    const { dueDate } = toExternalTask(issue(), VIEWER_ID);
    expect(dueDate!.getFullYear()).toBe(2026);
    expect(dueDate!.getMonth()).toBe(9);
    expect(dueDate!.getDate()).toBe(20);
    expect(dueDate!.getHours()).toBe(0);
    expect(dueDate!.getMinutes()).toBe(0);
  });

  it('sets assignedToViewer by comparing the assignee with the viewer', () => {
    expect(toExternalTask(issue(), 'someone-else').assignedToViewer).toBe(false);
    expect(
      toExternalTask(issue({ ...issueFixture, assignee: null }), VIEWER_ID).assignedToViewer,
    ).toBe(false);
  });

  it('rejects an unknown state type or priority at validation', () => {
    const state = { name: 'Odd', type: 'someday' };
    expect(linearIssueSchema.safeParse({ ...issueFixture, state }).success).toBe(false);
    expect(linearIssueSchema.safeParse({ ...issueFixture, priority: 9 }).success).toBe(false);
  });
});

describe('Linear mapper — projects', () => {
  const project = (overrides: Record<string, unknown> = {}) =>
    linearProjectSchema.parse({ ...issueFixture.project, ...overrides });
  const status = (type: string, name = 'Custom name') => ({ status: { type, name } });

  it('maps every mirrored field', () => {
    expect(toExternalProject(project())).toEqual({
      externalId: '5d2c9e1a-7b40-4c61-9f3e-2a8d1b6c0e01',
      url: 'https://linear.app/acme/project/sync-engine-5d2c9e1a7b40',
      title: 'Sync engine',
      description: 'Mirror Linear issues into DevBrain.',
      status: ProjectStatus.ACTIVE,
      statusLabel: 'In Progress',
      startDate: new Date(2026, 8, 1),
      dueDate: new Date(2026, 10, 15),
      color: '#4ea7fc',
      completedAt: null,
      createdAt: new Date('2026-08-20T09:00:00.000Z'),
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    });
  });

  it.each([
    ['backlog', ProjectStatus.NOT_STARTED],
    ['planned', ProjectStatus.NOT_STARTED],
    ['started', ProjectStatus.ACTIVE],
    ['paused', ProjectStatus.ON_HOLD],
    ['completed', ProjectStatus.COMPLETED],
    ['canceled', ProjectStatus.COMPLETED],
  ])('maps project status type %s', (type, expected) => {
    expect(toExternalProject(project(status(type))).status).toBe(expected);
  });

  it("keeps the team's status name as the label", () => {
    expect(toExternalProject(project(status('started', 'Building'))).statusLabel).toBe('Building');
  });

  it('rejects the deprecated state field without a status', () => {
    const legacy = { ...issueFixture.project, status: undefined, state: 'started' };
    expect(linearProjectSchema.safeParse(legacy).success).toBe(false);
  });

  it('gives a closed project a completedAt, as the database requires', () => {
    const completedAt = '2026-10-03T10:00:00.000Z';
    expect(toExternalProject(project({ ...status('completed'), completedAt })).completedAt).toEqual(
      new Date(completedAt),
    );
    const canceledAt = '2026-10-04T10:00:00.000Z';
    expect(toExternalProject(project({ ...status('canceled'), canceledAt })).completedAt).toEqual(
      new Date(canceledAt),
    );
  });

  it('maps a project with no dates, description or colour', () => {
    const mapped = toExternalProject(
      project({ startDate: null, targetDate: null, description: '', color: null }),
    );
    expect(mapped.startDate).toBeNull();
    expect(mapped.dueDate).toBeNull();
    expect(mapped.description).toBeNull();
    expect(mapped.color).toBeNull();
  });
});
