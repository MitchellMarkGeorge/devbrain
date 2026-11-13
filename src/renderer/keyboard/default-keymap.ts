import type { Command } from './commands';
import type { Keymap } from './keymap';

/** The pages `G` goes to. */
export type GoToPage =
  | 'home'
  | 'tasks'
  | 'projects'
  | 'notes'
  | 'calendar'
  | 'integrations'
  | 'settings'
  | 'trash';

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
  newProject?: () => void;
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
  { page: 'integrations', title: 'Integrations' },
  { page: 'settings', title: 'Settings' },
  { page: 'trash', title: 'Trash' },
];

function command(id: string, title: string, run: (() => void) | undefined): Command[] {
  return run ? [{ id, title, scope: 'global', run: () => run() }] : [];
}

/**
 * Going to a page leaves whatever had focus: a sidebar link clicked earlier would otherwise keep
 * it on the new page, and as a key was just pressed, the browser would draw its focus ring there.
 */
function leaveFocus() {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
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
    ...command('project.new', 'New project', actions.newProject),
    ...PAGES.flatMap(({ page, title }) =>
      command(
        `nav.${page}`,
        `Go to ${title}`,
        goTo &&
          (() => {
            leaveFocus();
            goTo(page);
          }),
      ),
    ),
    ...command('help.shortcuts', 'Keyboard shortcuts', actions.openShortcuts),
    ...command('sidebar.toggle', 'Toggle sidebar', actions.toggleSidebar),
  ];
}

const EVERYWHERE = 'Everywhere';
const LISTS = 'Lists';

// the list keys (list-commands.ts), in the `list` scope; labelled, so the shortcuts dialog lists
// them all from any page, not only while a list is mounted
const listEntries: Keymap['entries'] = [
  { scope: 'list', keys: 'arrowdown', command: 'list.down', group: LISTS, label: 'Down / up' },
  { scope: 'list', keys: 'arrowup', command: 'list.up', group: LISTS, label: 'Down / up' },
  { scope: 'list', keys: 'home', command: 'list.first', group: LISTS, label: 'First / last' },
  { scope: 'list', keys: 'end', command: 'list.last', group: LISTS, label: 'First / last' },
  { scope: 'list', keys: 'enter', command: 'row.open', group: LISTS, label: 'Open' },
  {
    scope: 'list',
    keys: 'arrowright',
    command: 'row.expand',
    group: LISTS,
    label: 'Show / hide subtasks',
  },
  {
    scope: 'list',
    keys: 'arrowleft',
    command: 'row.collapse',
    group: LISTS,
    label: 'Show / hide subtasks',
  },
  { scope: 'list', keys: 'x', command: 'list.toggleSelect', group: LISTS, label: 'Select' },
  {
    scope: 'list',
    keys: 'escape',
    command: 'list.clearSelection',
    group: LISTS,
    label: 'Clear selection',
  },
  { scope: 'list', keys: 's', command: 'row.openStatusMenu', group: LISTS, label: 'Change status' },
  ...[1, 2, 3].map((status) => ({
    scope: 'list' as const,
    keys: String(status),
    command: 'row.setStatus',
    args: { status },
    group: LISTS,
    label: 'Not started / in progress / completed',
  })),
  { scope: 'list', keys: 'f', command: 'row.favorite', group: LISTS, label: 'Favorite' },
  {
    scope: 'list',
    keys: 'mod+backspace',
    command: 'row.trash',
    group: LISTS,
    label: 'Move to trash',
  },
];

/** The keymap DevBrain ships with: one implicit mode, no counts. */
export const defaultKeymap: Keymap = {
  id: 'default',
  title: 'Default',
  groups: [EVERYWHERE, LISTS, 'Editor'],
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
    { scope: 'global', keys: 'g i', command: 'nav.integrations', group: EVERYWHERE },
    { scope: 'global', keys: 'g s', command: 'nav.settings', group: EVERYWHERE },
    // T is Tasks'; X is the mark for deleting
    { scope: 'global', keys: 'g x', command: 'nav.trash', group: EVERYWHERE },
    { scope: 'global', keys: '?', command: 'help.shortcuts', group: EVERYWHERE },
    {
      scope: 'global',
      keys: 'mod+\\',
      command: 'sidebar.toggle',
      allowInTyping: true,
      allowInEditor: true,
      group: EVERYWHERE,
    },
    { scope: 'global', keys: 'mod+z', command: 'app.undo', group: EVERYWHERE },
    // registered by a detail page whose menu has Duplicate (the task page; the note page's too)
    { scope: 'global', keys: 'mod+d', command: 'page.duplicate', group: EVERYWHERE },
    ...listEntries,
  ],
};
