import type { Command } from './commands';
import type { Keymap } from './keymap';

/** The pages `G` goes to. */
export type GoToPage = 'home' | 'tasks' | 'projects' | 'notes' | 'calendar';

/**
 * What the app-wide commands do, injected by whoever mounts them (the `/app` layout): the router
 * and the dialogs live outside the keyboard layer. An action left out registers no command, so its
 * keys go through to the page and the shortcuts dialog leaves them out (search and new task, until
 * their milestones).
 */
export interface AppCommandActions {
  openSearch?: () => void;
  newTask?: () => void;
  newNote?: () => void;
  goTo?: (page: GoToPage) => void;
  openShortcuts?: () => void;
  toggleSidebar?: () => void;
}

const PAGES: { page: GoToPage; title: string }[] = [
  { page: 'home', title: 'Home' },
  { page: 'tasks', title: 'Tasks' },
  { page: 'projects', title: 'Projects' },
  { page: 'notes', title: 'Notes' },
  { page: 'calendar', title: 'Calendar' },
];

function command(id: string, title: string, run: (() => void) | undefined): Command[] {
  return run ? [{ id, title, scope: 'global', run: () => run() }] : [];
}

/**
 * The app-wide commands, registered once by the `/app` layout with
 * `useCommands(createAppCommands(actions))`.
 */
export function createAppCommands(actions: AppCommandActions): Command[] {
  const { goTo } = actions;
  return [
    ...command('search.open', 'Search', actions.openSearch),
    ...command('task.new', 'New task', actions.newTask),
    ...command('note.new', 'New note', actions.newNote),
    ...PAGES.flatMap(({ page, title }) =>
      command(`nav.${page}`, `Go to ${title}`, goTo && (() => goTo(page))),
    ),
    ...command('help.shortcuts', 'Keyboard shortcuts', actions.openShortcuts),
    ...command('sidebar.toggle', 'Toggle sidebar', actions.toggleSidebar),
  ];
}

const EVERYWHERE = 'Everywhere';

/** The keymap DevBrain ships with: one implicit mode, no counts. */
export const defaultKeymap: Keymap = {
  id: 'default',
  title: 'Default',
  groups: [EVERYWHERE, 'Lists', 'Editor'],
  entries: [
    {
      scope: 'global',
      keys: 'mod+k',
      command: 'search.open',
      allowInTyping: true,
      group: EVERYWHERE,
    },
    { scope: 'global', keys: 'c', command: 'task.new', group: EVERYWHERE },
    { scope: 'global', keys: 'n', command: 'note.new', group: EVERYWHERE },
    { scope: 'global', keys: 'g h', command: 'nav.home', group: EVERYWHERE },
    { scope: 'global', keys: 'g t', command: 'nav.tasks', group: EVERYWHERE },
    { scope: 'global', keys: 'g p', command: 'nav.projects', group: EVERYWHERE },
    { scope: 'global', keys: 'g n', command: 'nav.notes', group: EVERYWHERE },
    { scope: 'global', keys: 'g c', command: 'nav.calendar', group: EVERYWHERE },
    { scope: 'global', keys: '?', command: 'help.shortcuts', group: EVERYWHERE },
    {
      scope: 'global',
      keys: 'mod+\\',
      command: 'sidebar.toggle',
      allowInTyping: true,
      allowInEditor: true,
      group: EVERYWHERE,
    },
  ],
};
