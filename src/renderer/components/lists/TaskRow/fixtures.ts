import {
  LinkState,
  Provider,
  TaskPriority,
  TaskStatus,
  type EventSummary,
  type ExternalRef,
  type ProjectSummary,
  type TaskLinkSummary,
  type TaskSummary,
} from '@common/types';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { storyAgo, storyDate } from '../../lib/story-dates';
import type { TaskRowData } from './types';

/**
 * Core-shaped sample tasks for stories: what `tasks.list` returns, cut to the fields a row reads
 * (`TaskRowData`), with real `Date`s around the story's day (22 Jun 2026).
 */

/** A task row with defaults for the fields left out: not started, low priority, no relations. */
export function sampleTask(fields: Partial<TaskRowData> & Pick<TaskRowData, 'title'>): TaskRowData {
  return {
    id: `tsk_${fields.title.toLowerCase().replace(/\W+/g, '_')}` as TaskId,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    dueDate: null,
    subtaskProgress: null,
    project: null,
    link: null,
    parentTask: null,
    external: null,
    ...fields,
  };
}

/** A project as a task's pill names it. The colour is a swatch name or a `#rrggbb`. */
export function sampleProject(title: string, color: string | null = null): ProjectSummary {
  return { id: `prj_${title.toLowerCase().replace(/\W+/g, '_')}` as ProjectId, title, color };
}

/** A subtask's parent. */
export function sampleParent(title: string, status = TaskStatus.IN_PROGRESS): TaskSummary {
  return { id: `tsk_${title.toLowerCase().replace(/\W+/g, '_')}` as TaskId, title, status };
}

export function sampleEventLink(
  title: string,
  color: string | null = null,
): { type: 'event' } & EventSummary {
  return {
    type: 'event',
    id: `evt_${title.toLowerCase().replace(/\W+/g, '_')}` as EventId,
    title,
    startAt: storyDate(0, 10),
    color,
  };
}

export function sampleNoteLink(title: string): TaskLinkSummary {
  return { type: 'note', id: `nte_${title.toLowerCase().replace(/\W+/g, '_')}` as NoteId, title };
}

/** A Linear issue's link, synced a few minutes ago. */
export function sampleLinear(key: string): ExternalRef {
  return {
    provider: Provider.LINEAR,
    state: LinkState.SYNCED,
    key,
    url: `https://linear.app/devbrain/issue/${key}`,
    statusLabel: 'In Progress',
    priorityLabel: null,
    lastSyncedAt: storyAgo(3),
  };
}

const DEVBRAIN = sampleProject('DevBrain 1.0', 'blue');

/** Sample tasks for stories. */
export const SAMPLE_TASKS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_onboarding' as TaskId,
    title: 'Ship the onboarding flow',
    status: TaskStatus.IN_PROGRESS,
    external: sampleLinear('ENG-124'),
    subtaskProgress: { completed: 3, total: 4 },
    project: DEVBRAIN,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(0),
  }),
  sampleTask({
    id: 'tsk_calendar_sync' as TaskId,
    title: 'Scope calendar sync for recurring events',
    project: sampleProject('Calendar', 'green'),
    link: sampleEventLink('Mitchell / Jesse 1:1', 'indigo'),
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-3),
  }),
  sampleTask({
    id: 'tsk_release_notes' as TaskId,
    title: 'Write the release notes',
    link: sampleNoteLink('Release checklist'),
    dueDate: storyDate(12),
  }),
  sampleTask({
    id: 'tsk_empty_states' as TaskId,
    title: 'Draw the empty states',
    status: TaskStatus.IN_PROGRESS,
    project: sampleProject('Design system', 'pink'),
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(1),
  }),
  sampleTask({
    id: 'tsk_migrations' as TaskId,
    title: 'Split the event model migration',
    status: TaskStatus.COMPLETED,
    external: sampleLinear('ENG-98'),
    project: DEVBRAIN,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-2),
  }),
];

const ONBOARDING = sampleParent('Ship the onboarding flow');

export const SAMPLE_SUBTASKS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_welcome' as TaskId,
    title: 'Welcome screen copy',
    status: TaskStatus.COMPLETED,
    parentTask: ONBOARDING,
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-1),
  }),
  sampleTask({
    id: 'tsk_workspace' as TaskId,
    title: 'Create workspace step',
    status: TaskStatus.IN_PROGRESS,
    parentTask: ONBOARDING,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(0),
  }),
  sampleTask({
    id: 'tsk_import' as TaskId,
    title: 'Import from Linear',
    external: sampleLinear('ENG-131'),
    parentTask: ONBOARDING,
  }),
];

/** A task with every pill, for stacking. */
export const BUSY_TASK: TaskRowData = sampleTask({
  title: 'Move the sync engine onto change listeners and drop the old callbacks',
  status: TaskStatus.IN_PROGRESS,
  external: sampleLinear('ENG-142'),
  parentTask: sampleParent('Refactor core services', TaskStatus.NOT_STARTED),
  subtaskProgress: { completed: 1, total: 5 },
  project: sampleProject('Platform', 'amber'),
  link: sampleEventLink('Architecture review', 'blue'),
  priority: TaskPriority.HIGH,
  dueDate: storyDate(0),
});

const TITLES = [
  'Review the sync retry backoff',
  'Write the release notes',
  'Fix calendar sync for recurring events',
  'Audit token storage',
  'Draw the empty states',
  'Benchmark inference latency',
  'Rotate token signing keys',
  'Update SDK docs for PKCE',
];
const PROJECTS = [
  sampleProject('DevBrain 1.0', 'blue'),
  sampleProject('Calendar', 'green'),
  sampleProject('Design system', 'pink'),
  null,
];

/**
 * `count` generated tasks for long-list stories (ids `tsk_many_0`…), with a mix of statuses,
 * priorities, due dates, keys and projects. `from` offsets the numbering for a later page.
 */
export function manyTasks(count: number, from = 0): TaskRowData[] {
  return Array.from({ length: count }, (_, k) => {
    const i = from + k;
    return sampleTask({
      id: `tsk_many_${i}` as TaskId,
      title: `${TITLES[i % TITLES.length]} #${i + 1}`,
      status: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED][i % 3],
      priority: [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW][(i >> 1) % 3],
      dueDate: i % 5 === 4 ? null : storyDate((i % 17) - 4),
      external: i % 4 === 0 ? sampleLinear(`ENG-${200 + i}`) : null,
      project: PROJECTS[i % PROJECTS.length],
    });
  });
}
