import type { Keymap, KeymapEntry } from './keymap';

/** Vim's modes, the first being the one it starts in. */
export const VIM_MODES = ['normal', 'insert', 'visual', 'hint', 'command'] as const;
export type VimMode = (typeof VIM_MODES)[number];

/** `mode.set`: puts the keyboard in `args.mode`. Registered by `KeyboardProvider`. */
export const SET_MODE_COMMAND_ID = 'mode.set';

// the keys sheet's sections (Figma `7704:59901`)
const MOVE = 'Move';
const GO_TO = 'Go to';
const ACT = 'Act';
const FIND = 'Find';

const normal = (entry: Omit<KeymapEntry, 'mode'>): KeymapEntry => ({ ...entry, mode: 'normal' });

const GO_TO_PAGES: [key: string, page: string][] = [
  ['h', 'home'],
  ['t', 'tasks'],
  ['p', 'projects'],
  ['n', 'notes'],
  ['c', 'calendar'],
  ['i', 'integrations'],
  ['s', 'settings'],
  ['x', 'trash'],
];

/**
 * The Vim keymap (Figma `7702:55372`–`7714:56845`), chosen by the `general.keyboardMode` setting.
 * It binds the commands the default keymap binds (and a few of its own) to Vim's keys, in modes:
 * Normal, where single letters are commands; Insert, which focus in a text field or the editor
 * switches to and Esc leaves; Visual, a range of rows (`v`); Hint (`f`); and Command (`:`).
 * Counts are on (`5j`, `3dd`), and keys are written in their own case (`g` and `G` differ).
 */
export const vimKeymap: Keymap = {
  id: 'vim',
  title: 'Vim',
  modes: VIM_MODES,
  insertMode: 'insert',
  counts: true,
  upperCaseKeys: false,
  groups: [MOVE, GO_TO, ACT, FIND],
  entries: [
    // ---------- everywhere ----------
    {
      scope: 'global',
      keys: 'mod+k',
      command: 'search.open',
      allowInTyping: true,
      group: FIND,
      label: 'Search',
    },
    {
      scope: 'global',
      keys: 'mod+\\',
      command: 'sidebar.toggle',
      allowInTyping: true,
      allowInEditor: true,
      group: ACT,
    },
    ...GO_TO_PAGES.map(([key, page]) =>
      normal({ scope: 'global', keys: `g ${key}`, command: `nav.${page}`, group: GO_TO }),
    ),
    normal({ scope: 'global', keys: 'c', command: 'task.new', group: ACT, label: 'New task' }),
    normal({ scope: 'global', keys: 'u', command: 'app.undo', group: ACT, label: 'Undo' }),
    normal({ scope: 'global', keys: 'mod+z', command: 'app.undo', hidden: true }),
    normal({ scope: 'global', keys: 'mod+d', command: 'page.duplicate', group: ACT }),
    normal({ scope: 'global', keys: '?', command: 'help.shortcuts', group: FIND, label: 'Keys' }),
    // Visual and Hint end with Esc; Insert's Esc is the field's (see `insertMode`)
    ...(['visual', 'hint'] as const).map(
      (mode): KeymapEntry => ({
        scope: 'global',
        mode,
        keys: 'escape',
        command: SET_MODE_COMMAND_ID,
        args: { mode: 'normal' },
        hidden: true,
      }),
    ),

    // ---------- lists (list-commands.ts) ----------
    normal({ scope: 'list', keys: 'j', command: 'list.down', group: MOVE, label: 'Down / up' }),
    normal({ scope: 'list', keys: 'k', command: 'list.up', group: MOVE, label: 'Down / up' }),
    normal({ scope: 'list', keys: 'arrowdown', command: 'list.down', hidden: true }),
    normal({ scope: 'list', keys: 'arrowup', command: 'list.up', hidden: true }),
    normal({
      scope: 'list',
      keys: 'g g',
      command: 'list.first',
      group: MOVE,
      label: 'First / last item',
    }),
    normal({
      scope: 'list',
      keys: 'G',
      command: 'list.last',
      group: MOVE,
      label: 'First / last item',
    }),
    normal({
      scope: 'list',
      keys: 'l',
      command: 'row.expand',
      group: MOVE,
      label: 'Show / hide subtasks',
    }),
    normal({
      scope: 'list',
      keys: 'h',
      command: 'row.collapse',
      group: MOVE,
      label: 'Show / hide subtasks',
    }),
    normal({ scope: 'list', keys: 'enter', command: 'row.open', group: ACT, label: 'Open' }),
    normal({ scope: 'list', keys: 'o', command: 'row.open', group: ACT, label: 'Open' }),
    normal({ scope: 'list', keys: 'x', command: 'list.toggleSelect', group: ACT, label: 'Select' }),
    normal({
      scope: 'list',
      keys: 's',
      command: 'row.openStatusMenu',
      group: ACT,
      label: 'Status',
    }),
    // `f` is hints in Vim, so a favorite is a star
    normal({ scope: 'list', keys: '*', command: 'row.favorite', group: ACT, label: 'Favorite' }),
    normal({
      scope: 'list',
      keys: 'd d',
      command: 'row.trash',
      group: ACT,
      label: 'Move to trash',
    }),
    normal({ scope: 'list', keys: 'escape', command: 'list.clearSelection', hidden: true }),
  ],
};
