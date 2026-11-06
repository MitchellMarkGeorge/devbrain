import type { TaskRowData } from '../../lists/TaskRow';
import { TaskPriority, TaskStatus } from '@common/types';
import { sampleLinear, sampleTask } from '../../lists/TaskRow/fixtures';
import { storyDate } from '../../lib/story-dates';
import type { TaskId } from '@common/ids';

/** The PKCE task's subtasks, as the Figma task screens show them. */
export const PKCE_SUBTASKS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_eng-125' as TaskId,
    title: 'Generate code verifier',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-6),
    external: sampleLinear('ENG-125'),
  }),
  sampleTask({
    id: 'tsk_eng-126' as TaskId,
    title: 'S256 challenge',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-5),
    external: sampleLinear('ENG-126'),
  }),
  sampleTask({
    id: 'tsk_eng-127' as TaskId,
    title: 'Token exchange endpoint',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-127'),
  }),
  sampleTask({
    id: 'tsk_eng-128' as TaskId,
    title: 'Mobile fallback',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-128'),
  }),
];

export const PKCE_DESCRIPTION = [
  'Replace the implicit-flow handoff with PKCE for every first-party client, on web and mobile. Use an S256 challenge, a 96-character code verifier and a 10-minute lifetime for authorization codes.',
  'Keep the migration backwards-compatible for one release: both flows stay behind a feature flag until the mobile fallback ships, then the implicit flow is removed.',
];
