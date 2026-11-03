import type { Task, MenuItem, CommandProps } from '..';
export const tasks: Task[] = [
  {
    id: 'task-1',
    title: 'Implement workspace navigation',
    status: 'in-progress',
    key: 'ENG-124',
    source: 'linear',
    priority: 'high',
    project: 'DevBrain',
    projectColor: 'indigo',
    subtasks: [3, 4],
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: 'task-2',
    title: 'Review the calendar integration',
    status: 'not-started',
    priority: 'medium',
    event: 'Weekly planning',
    eventColor: 'blue',
    date: 'Nov 6',
  },
  {
    id: 'task-3',
    title: 'Write the component guidelines',
    status: 'overdue',
    priority: 'low',
    note: 'Design system',
    date: 'Nov 1',
    dateTone: 'overdue',
  },
  {
    id: 'task-4',
    title: 'Set up renderer tokens',
    status: 'completed',
    priority: 'medium',
    project: 'DevBrain',
    projectColor: 'indigo',
    date: 'Nov 2',
  },
];
export const menuItems: MenuItem[] = [
  { heading: 'Task actions' },
  { label: 'Duplicate', icon: 'copy', shortcut: '⌘D' },
  {
    label: 'Link to',
    icon: 'link',
    items: [
      { label: 'Project', icon: 'folder' },
      { label: 'Note', icon: 'file-text' },
    ],
  },
  { separator: true },
  { label: 'Copy as Markdown', icon: 'clipboard' },
  { separator: true },
  { label: 'Move to trash', icon: 'trash-2', destructive: true },
];
export const commandGroups: CommandProps['groups'] = [
  {
    heading: 'Go to',
    items: [
      { label: 'Home', icon: 'house', shortcut: 'G H' },
      { label: 'Tasks', icon: 'circle-check', shortcut: 'G T' },
    ],
  },
  {
    heading: 'Create',
    items: [
      { label: 'New task', icon: 'plus' },
      { label: 'New note', icon: 'file-text' },
      { label: 'New project', icon: 'folder' },
    ],
  },
];
