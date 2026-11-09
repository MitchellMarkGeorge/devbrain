import { TaskPriority, TaskStatus } from '@common/types';
import type { TaskRowData } from '../../lists/TaskRow';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleParent,
  sampleProject,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { storyDate } from '../../lib/story-dates';
import type { TaskId } from '@common/ids';

/** The open tasks of the Figma "Tasks (list)" screen, in priority order. */
export const LIST_TASKS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_eng-124' as TaskId,
    title: 'Implement OAuth2 PKCE flow',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-124'),
    subtaskProgress: { completed: 3, total: 4 },
    project: sampleProject('Auth Overhaul', 'blue'),
    link: sampleEventLink('Mitchell / Jesse 1:1', 'green'),
  }),
  sampleTask({
    id: 'tsk_eng-128' as TaskId,
    title: 'Mobile fallback',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-128'),
    parentTask: sampleParent('Implement OAuth2 PKCE flow', TaskStatus.IN_PROGRESS),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_eng-131' as TaskId,
    title: 'Refactor token refresh logic',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-4),
    external: sampleLinear('ENG-131'),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_eng-118' as TaskId,
    title: 'Audit token storage',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-118'),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_pkce-guide' as TaskId,
    title: 'Write PKCE migration guide',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(0),
    project: sampleProject('Auth Overhaul', 'blue'),
    link: sampleNoteLink('PKCE design notes'),
  }),
  sampleTask({
    id: 'tsk_eng-140' as TaskId,
    title: 'Integrate database connection',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(4),
    external: sampleLinear('ENG-140'),
    project: sampleProject('API Gateway v2', 'amber'),
  }),
  sampleTask({
    id: 'tsk_ui-mockups' as TaskId,
    title: 'Create user interface mockups',
    dueDate: storyDate(8),
    subtaskProgress: { completed: 1, total: 4 },
    project: sampleProject('User Interface Revamp', 'indigo'),
  }),
  sampleTask({
    id: 'tsk_eng-102' as TaskId,
    title: 'Set up API Gateway',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(-7),
    external: sampleLinear('ENG-102'),
    project: sampleProject('API Gateway v2', 'amber'),
  }),
];

const byId = (id: string) => LIST_TASKS.find((t) => t.id === `tsk_${id}`)!;
// in a project group the project pill is left out: the heading names it
const inGroup = (id: string): TaskRowData => ({ ...byId(id), project: null });

/** The "Tasks (group)" screen's groups, by project. */
export const GROUPS = [
  {
    label: 'Auth Overhaul',
    color: 'blue' as const,
    count: 12,
    tasks: [inGroup('eng-124'), inGroup('eng-131'), inGroup('eng-118'), inGroup('pkce-guide')],
  },
  {
    label: 'API Gateway v2',
    color: 'amber' as const,
    count: 10,
    tasks: [inGroup('eng-140'), inGroup('eng-102')],
  },
  {
    label: 'ML Platform',
    color: 'pink' as const,
    count: 10,
    tasks: [
      sampleTask({
        id: 'tsk_eng-152' as TaskId,
        title: 'Benchmark inference latency',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(3),
        external: sampleLinear('ENG-152'),
      }),
    ],
  },
];

/** The "Tasks (board)" screen's columns. */
export const BOARD: Record<'notStarted' | 'inProgress' | 'completed', TaskRowData[]> = {
  notStarted: [
    sampleTask({
      title: 'Audit token storage',
      priority: TaskPriority.HIGH,
      dueDate: storyDate(-3),
      external: sampleLinear('ENG-118'),
      project: sampleProject('Auth Overhaul', 'blue'),
    }),
    sampleTask({
      title: 'Write PKCE migration guide',
      priority: TaskPriority.MEDIUM,
      dueDate: storyDate(0),
      project: sampleProject('Auth Overhaul', 'blue'),
      link: sampleNoteLink('PKCE design notes'),
    }),
    sampleTask({
      title: 'Integrate database connection',
      priority: TaskPriority.MEDIUM,
      dueDate: storyDate(4),
      external: sampleLinear('ENG-140'),
      project: sampleProject('API Gateway v2', 'amber'),
    }),
    sampleTask({
      title: 'Summarise sprint feedback',
      dueDate: storyDate(4),
      project: sampleProject('AI Action Items', 'green'),
      link: sampleEventLink('Sprint Planning', 'green'),
    }),
    sampleTask({
      title: 'Create user interface mockups',
      dueDate: storyDate(8),
      subtaskProgress: { completed: 1, total: 4 },
      project: sampleProject('User Interface Revamp', 'indigo'),
    }),
  ],
  inProgress: [
    sampleTask({
      title: 'Implement OAuth2 PKCE flow',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: storyDate(2),
      external: sampleLinear('ENG-124'),
      subtaskProgress: { completed: 3, total: 4 },
      project: sampleProject('Auth Overhaul', 'blue'),
      link: sampleEventLink('Mitchell / Jesse 1:1', 'green'),
    }),
    sampleTask({
      title: 'Refactor token refresh logic',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: storyDate(-4),
      external: sampleLinear('ENG-131'),
      project: sampleProject('Auth Overhaul', 'blue'),
    }),
    sampleTask({
      title: 'Benchmark inference latency',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      dueDate: storyDate(3),
      project: sampleProject('ML Platform', 'pink'),
    }),
  ],
  completed: [
    sampleTask({
      title: 'Set up API Gateway',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.MEDIUM,
      dueDate: storyDate(-7),
      external: sampleLinear('ENG-102'),
      project: sampleProject('API Gateway v2', 'amber'),
    }),
  ],
};
