/** The Figma screens' sample data, shared by the screen stories. */
import { TaskPriority, TaskStatus } from '@common/types';
import { PageToolbar } from '../../shell/Page';
import type { TaskRowData } from '../../lists/TaskRow';
import { DemoToolbarEnd, DemoToolbarStart } from '../../lists/ListToolbar/fixtures';
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

/** "Tasks (list)": the eight tasks of the Figma screen, in its order. */
export const FIGMA_TASKS: TaskRowData[] = [
  sampleTask({
    id: 'tsk_pkce' as TaskId,
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
    id: 'tsk_mobile' as TaskId,
    title: 'Mobile fallback',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-128'),
    parentTask: sampleParent('Implement OAuth2 PKCE flow', TaskStatus.IN_PROGRESS),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_refresh' as TaskId,
    title: 'Refactor token refresh logic',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-4),
    external: sampleLinear('ENG-131'),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_audit' as TaskId,
    title: 'Audit token storage',
    priority: TaskPriority.HIGH,
    dueDate: storyDate(-3),
    external: sampleLinear('ENG-118'),
    project: sampleProject('Auth Overhaul', 'blue'),
  }),
  sampleTask({
    id: 'tsk_guide' as TaskId,
    title: 'Write PKCE migration guide',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(0),
    project: sampleProject('Auth Overhaul', 'blue'),
    link: sampleNoteLink('PKCE design notes'),
  }),
  sampleTask({
    id: 'tsk_database' as TaskId,
    title: 'Integrate database connection',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(4),
    external: sampleLinear('ENG-140'),
    project: sampleProject('API Gateway v2', 'amber'),
  }),
  sampleTask({
    id: 'tsk_mockups' as TaskId,
    title: 'Create user interface mockups',
    dueDate: storyDate(8),
    subtaskProgress: { completed: 1, total: 4 },
    project: sampleProject('User Interface Revamp', 'indigo'),
  }),
  sampleTask({
    id: 'tsk_gateway' as TaskId,
    title: 'Set up API Gateway',
    status: TaskStatus.COMPLETED,
    dueDate: storyDate(-7),
    external: sampleLinear('ENG-102'),
    project: sampleProject('API Gateway v2', 'amber'),
  }),
];

/** The tasks page's toolbar: Status and the filters at the left, Display at the right. */
export function TasksToolbar({ compact = false }: { compact?: boolean }) {
  return (
    <PageToolbar
      start={<DemoToolbarStart list="tasks" compact={compact} />}
      end={<DemoToolbarEnd list="tasks" compact={compact} />}
    />
  );
}
