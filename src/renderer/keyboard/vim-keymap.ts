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

type Entry = Omit<KeymapEntry, 'mode'>;
const normal = (entry: Entry): KeymapEntry => ({ ...entry, mode: 'normal' });
const visual = (entry: Entry): KeymapEntry => ({ ...entry, mode: 'visual' });
const hidden = (entry: KeymapEntry): KeymapEntry => ({ ...entry, hidden: true });

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

// the cursor's moves in a list, in Normal mode and (growing the range) in Visual
const listMoves = (mode: (entry: Entry) => KeymapEntry): KeymapEntry[] => [
  mode({ scope: 'list', keys: 'j', command: 'list.down', group: MOVE, label: 'Down / up' }),
  mode({ scope: 'list', keys: 'k', command: 'list.up', group: MOVE, label: 'Down / up' }),
  hidden(mode({ scope: 'list', keys: 'arrowdown', command: 'list.down' })),
  hidden(mode({ scope: 'list', keys: 'arrowup', command: 'list.up' })),
  mode({ scope: 'list', keys: 'g g', command: 'list.first', group: MOVE, label: 'First / last' }),
  mode({ scope: 'list', keys: 'G', command: 'list.last', group: MOVE, label: 'First / last' }),
  mode({
    scope: 'list',
    keys: 'ctrl+d',
    command: 'list.halfPageDown',
    group: MOVE,
    label: 'Half a page',
  }),
  mode({
    scope: 'list',
    keys: 'ctrl+u',
    command: 'list.halfPageUp',
    group: MOVE,
    label: 'Half a page',
  }),
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
    normal({
      scope: 'global',
      keys: 'ctrl+o',
      command: 'nav.back',
      group: GO_TO,
      label: 'Back / forward',
    }),
    normal({
      scope: 'global',
      keys: 'ctrl+i',
      command: 'nav.forward',
      group: GO_TO,
      label: 'Back / forward',
    }),
    normal({ scope: 'global', keys: 'c', command: 'task.new', group: ACT, label: 'New task' }),
    normal({ scope: 'global', keys: 'u', command: 'app.undo', group: ACT, label: 'Undo / redo' }),
    normal({
      scope: 'global',
      keys: 'ctrl+r',
      command: 'app.redo',
      group: ACT,
      label: 'Undo / redo',
    }),
    normal({ scope: 'global', keys: '.', command: 'app.repeat', group: ACT, label: 'Repeat' }),
    hidden(normal({ scope: 'global', keys: 'mod+z', command: 'app.undo' })),
    normal({ scope: 'global', keys: 'mod+d', command: 'page.duplicate', group: ACT }),
    normal({ scope: 'global', keys: '?', command: 'help.shortcuts', group: FIND, label: 'Keys' }),
    normal({ scope: 'global', keys: 'f', command: 'hints.show', group: FIND, label: 'Hints' }),
    // in an open menu (Status), j/k are its ↓/↑; elsewhere, from nowhere, they enter the page's
    // list or board
    ...(['j', 'k'] as const).map((keys) =>
      hidden(
        normal({
          scope: 'global',
          keys,
          command: keys === 'j' ? 'menu.down' : 'menu.up',
          allowInMenu: true,
        }),
      ),
    ),
    ...['j', 'k', 'g g', 'G'].map((keys) =>
      hidden(normal({ scope: 'global', keys, command: 'cursor.enter' })),
    ),
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
    ...listMoves(normal),
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
    normal({ scope: 'list', keys: 'v', command: 'list.visual', group: ACT, label: 'Visual range' }),
    hidden(normal({ scope: 'list', keys: 'V', command: 'list.visual' })),
    normal({
      scope: 'list',
      keys: 's',
      command: 'row.openStatusMenu',
      group: ACT,
      label: 'Status',
    }),
    // `f` is hints in Vim, so a favorite is a star
    normal({
      scope: 'list',
      keys: '*',
      command: 'row.favorite',
      group: ACT,
      label: 'Favorite',
      repeatable: true,
    }),
    normal({
      scope: 'list',
      keys: 'd d',
      command: 'row.trash',
      group: ACT,
      label: 'Move to trash',
      repeatable: true,
    }),
    normal({
      scope: 'list',
      keys: 'escape',
      command: 'list.clearSelection',
      group: ACT,
      label: 'Back out one step',
    }),

    // ---------- a Visual range: moving grows it, and a row key acts on it ----------
    ...listMoves(visual),
    visual({ scope: 'list', keys: 'x', command: 'list.toggleSelect', group: ACT, label: 'Select' }),
    visual({
      scope: 'list',
      keys: 's',
      command: 'row.openStatusMenu',
      group: ACT,
      label: 'Status',
    }),
    visual({ scope: 'list', keys: '*', command: 'row.favorite', group: ACT, label: 'Favorite' }),
    visual({ scope: 'list', keys: 'd', command: 'row.trash', group: ACT, label: 'Move to trash' }),
    visual({
      scope: 'list',
      keys: 'escape',
      command: 'list.cancelVisual',
      group: ACT,
      label: 'Back out one step',
    }),

    // ---------- the board (board-commands.ts) ----------
    normal({ scope: 'board', keys: 'j', command: 'board.down', group: MOVE, label: 'Down / up' }),
    normal({ scope: 'board', keys: 'k', command: 'board.up', group: MOVE, label: 'Down / up' }),
    normal({
      scope: 'board',
      keys: 'h',
      command: 'board.left',
      group: MOVE,
      label: 'Left / right, or next pane',
    }),
    normal({
      scope: 'board',
      keys: 'l',
      command: 'board.right',
      group: MOVE,
      label: 'Left / right, or next pane',
    }),
    normal({
      scope: 'board',
      keys: 'g g',
      command: 'board.first',
      group: MOVE,
      label: 'First / last',
    }),
    normal({
      scope: 'board',
      keys: 'G',
      command: 'board.last',
      group: MOVE,
      label: 'First / last',
    }),
    normal({ scope: 'board', keys: 'o', command: 'board.open', group: ACT, label: 'Open' }),
    normal({
      scope: 'board',
      keys: '*',
      command: 'board.favorite',
      group: ACT,
      label: 'Favorite',
      repeatable: true,
    }),
    normal({
      scope: 'board',
      keys: 'd d',
      command: 'board.trash',
      group: ACT,
      label: 'Move to trash',
      repeatable: true,
    }),
    normal({
      scope: 'board',
      keys: 'escape',
      command: 'board.closeSheet',
      group: ACT,
      label: 'Back out one step',
    }),
  ],
};
