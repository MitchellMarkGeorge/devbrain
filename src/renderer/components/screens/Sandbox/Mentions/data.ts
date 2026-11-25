/* Sandbox mock data: what mentions the PKCE task, its ADR note and the Design Review event. */
import { TaskStatus } from '@common/types';
import type { TaskId } from '@common/ids';
import { TaskPriority } from '@common/types';
import { sampleLinear, sampleTask } from '../../../lists/TaskRow/fixtures';
import { storyDate } from '../../../lib/story-dates';
import type { Mention } from './MentionsSection';

export const PKCE_TITLE = 'Implement OAuth2 PKCE flow';

export const PKCE_MENTIONS: Mention[] = [
  {
    id: 'b1',
    source: { type: 'event', title: 'Mitchell / Jesse 1:1', color: 'green' },
    updated: '2h ago',
  },
  {
    id: 'b2',
    source: { type: 'note', title: 'Architecture ADR #4 — PKCE' },
    updated: 'Yesterday',
  },
  {
    id: 'b3',
    source: { type: 'note', title: 'Security review — June' },
    updated: 'Jun 18',
  },
  {
    id: 'b4',
    source: { type: 'task', title: 'Write PKCE migration guide', status: TaskStatus.NOT_STARTED },
    updated: 'Jun 17',
  },
  {
    id: 'b5',
    source: { type: 'note', title: 'Weekly log — wk 25' },
    updated: 'Jun 14',
  },
  {
    id: 'b6',
    source: { type: 'project', title: 'Auth Overhaul', color: 'blue' },
    updated: 'Jun 10',
  },
  {
    id: 'b7',
    source: { type: 'note', title: 'Auth0 call notes' },
    updated: 'Jun 9',
  },
];

export const ADR_TITLE = 'Architecture ADR #4 — PKCE';

export const ADR_MENTIONS: Mention[] = [
  {
    id: 'n0',
    source: { type: 'task', title: PKCE_TITLE, status: TaskStatus.IN_PROGRESS },
    updated: '3h ago',
  },
  {
    id: 'n1',
    source: { type: 'note', title: 'Security review — June' },
    updated: 'Jun 18',
  },
  {
    id: 'n2',
    source: { type: 'event', title: 'Auth Overhaul Design Review', color: 'blue' },
    updated: 'Jun 12',
  },
  {
    id: 'n3',
    source: { type: 'note', title: 'Auth provider eval matrix' },
    updated: 'Jun 4',
  },
];

export const DESIGN_REVIEW_MENTIONS: Mention[] = [
  {
    id: 'e1',
    source: { type: 'note', title: 'Billing revamp — scope' },
    updated: 'Yesterday',
  },
  {
    id: 'e2',
    source: {
      type: 'task',
      title: 'Create user interface mockups',
      status: TaskStatus.NOT_STARTED,
    },
    updated: 'Jun 19',
  },
  {
    id: 'e3',
    source: { type: 'note', title: 'Design review: empty states' },
    updated: 'Jun 8',
  },
];

/** The ADR note's tasks (its Tasks section). */
export const ADR_TASKS = [
  sampleTask({
    id: 'tsk_124' as TaskId,
    title: PKCE_TITLE,
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueDate: storyDate(2),
    external: sampleLinear('ENG-124'),
    subtaskProgress: { completed: 3, total: 4 },
  }),
  sampleTask({
    id: 'tsk_132' as TaskId,
    title: 'Write PKCE migration guide',
    priority: TaskPriority.MEDIUM,
    dueDate: storyDate(6),
  }),
];
