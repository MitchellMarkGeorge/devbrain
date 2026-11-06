import type { Command } from './commands';
import type { Keymap } from './keymap';

/** The pages `G` goes to. */
export type GoToPage = 'home' | 'tasks' | 'projects' | 'notes' | 'calendar';

/**
 * What the app-wide commands do, injected by whoever mounts them (the `/app` layout): the router
 * and the dialogs live outside the keyboard layer.
 */
export interface AppCommandActions {
  openSearch: () => void;
  newTask: () => void;
  newNote: () => void;
  goTo: (page: GoToPage) => void;
  openShortcuts: () => void;
  toggleSidebar: () => void;
}

const PAGES: { page: GoToPage; title: string }[] = [
  { page: 'home', title: 'Home' },
  { page: 'tasks', title: 'Tasks' },
  { page: 'projects', title: 'Projects' },
  { page: 'notes', title: 'Notes' },
  { page: 'calendar', title: 'Calendar' },
];

/**
 * The app-wide commands, registered once by the `/app` layout with
 * `useCommands(createAppCommands(actions))`.
 */
export function createAppCommands(actions: AppCommandActions): Command[] {
  return [
    { id: 'search.open', title: 'Search', scope: 'global', run: () => actions.openSearch() },
    { id: 'task.new', title: 'New task', scope: 'global', run: () => actions.newTask() },
    { id: 'note.new', title: 'New note', scope: 'global', run: () => actions.newNote() },
    ...PAGES.map(
      ({ page, title }): Command => ({
        id: `nav.${page}`,
        title: `Go to ${title}`,
        scope: 'global',
        run: () => actions.goTo(page),
      }),
    ),
    {
      id: 'help.shortcuts',
      title: 'Keyboard shortcuts',
      scope: 'global',
      run: () => actions.openShortcuts(),
    },
    {
      id: 'sidebar.toggle',
      title: 'Toggle sidebar',
      scope: 'global',
      run: () => actions.toggleSidebar(),
    },
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
