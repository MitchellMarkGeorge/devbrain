import type { Task } from './types';

/** Sample tasks for stories. */
export const SAMPLE_TASKS: Task[] = [
  {
    id: 'onboarding',
    title: 'Ship the onboarding flow',
    status: 'in-progress',
    key: 'ENG-124',
    subtasks: [3, 4],
    project: 'DevBrain 1.0',
    projectColor: 'blue',
    priority: 'high',
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: 'calendar-sync',
    title: 'Scope calendar sync for recurring events',
    status: 'not-started',
    project: 'Calendar',
    projectColor: 'green',
    event: 'Mitchell / Jesse 1:1',
    eventColor: 'indigo',
    priority: 'medium',
    date: 'Sep 28',
    dateTone: 'overdue',
  },
  {
    id: 'release-notes',
    title: 'Write the release notes',
    status: 'not-started',
    note: 'Release checklist',
    priority: 'low',
    date: 'Oct 4',
  },
  {
    id: 'empty-states',
    title: 'Draw the empty states',
    status: 'in-progress',
    key: '#212',
    source: 'github',
    project: 'Design system',
    projectColor: 'pink',
    priority: 'medium',
    date: 'Tomorrow',
  },
  {
    id: 'migrations',
    title: 'Split the event model migration',
    status: 'completed',
    key: 'ENG-98',
    project: 'DevBrain 1.0',
    projectColor: 'blue',
    priority: 'high',
    date: 'Sep 20',
  },
];

export const SAMPLE_SUBTASKS: Task[] = [
  {
    id: 'welcome',
    title: 'Welcome screen copy',
    status: 'completed',
    parent: 'Ship the onboarding flow',
    priority: 'medium',
    date: 'Sep 30',
  },
  {
    id: 'workspace',
    title: 'Create workspace step',
    status: 'in-progress',
    parent: 'Ship the onboarding flow',
    priority: 'high',
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: 'import',
    title: 'Import from Linear',
    status: 'not-started',
    key: 'ENG-131',
    parent: 'Ship the onboarding flow',
    priority: 'low',
  },
];

/** A task with every pill, for stacking. */
export const BUSY_TASK: Task = {
  title: 'Move the sync engine onto change listeners and drop the old callbacks',
  status: 'in-progress',
  key: 'ENG-142',
  parent: 'Refactor core services',
  subtasks: [1, 5],
  project: 'Platform',
  projectColor: 'amber',
  event: 'Architecture review',
  eventColor: 'blue',
  note: 'Sync engine notes',
  priority: 'high',
  date: 'Today',
  dateTone: 'today',
};
