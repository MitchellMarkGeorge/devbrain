# Keyboard layer

Commands, scopes, keymaps and one dispatcher, so the app's keys are data and a Vim mode is a second
keymap rather than a rewrite. The plan is in `docs/renderer/implementation-plan.md` ("Keyboard:
commands, keymaps and Vim mode"). Mounted in the app as "Mounting it" says; `Keyboard/KeyboardLayer`
in Storybook mounts it with a demo keymap.

| File                   | What it holds                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `commands.ts`          | `Command`, `CommandContext`, and the `CommandRegistry`                             |
| `undo.ts`              | `Undoable` and the app's `UndoStack`                                               |
| `scopes.ts`            | the scope stack, and `activeScopes` (read from the DOM around the focused element) |
| `keymap.ts`            | `Keymap` and `KeymapEntry`: bindings as data                                       |
| `keys.ts`              | key notation (`mod+k`, `g t`): parsing, reading `keydown`s, and labels for `Kbd`   |
| `dispatcher.ts`        | `KeyDispatcher`: the one capture-phase `keydown` listener, with no React in it     |
| `KeyboardProvider.tsx` | the provider and hooks: `useCommands`, `useRunCommand`, `useKeyboardState`, …      |
| `KeyScope.tsx`         | `<KeyScope name>`: makes a subtree a scope while focus is inside it                |
| `default-keymap.ts`    | the keymap DevBrain ships with, and `createAppCommands(actions)`                   |
| `vim-keymap.ts`        | Vim mode's keymap (`general.keyboardMode: 'vim'`): modes, counts, Vim's keys       |
| `ModeLine.tsx`         | Vim's mode line: the shell's `StatusLine`, filled from the dispatcher's state      |
| `list-commands.ts`     | `useListCommands(ref, actions)`: the list keys' commands, over a list's ref        |
| `board-commands.ts`    | `useBoardCommands(columns, actions)`: Vim's board keys, over the columns' handles  |
| `cursor.ts`            | `cursor.enter` (a first `j` enters the page's list) and `j`/`k` in an open menu    |
| `shortcuts.ts`         | the shortcuts dialog's sections, and a command's keys (`commandShortcut`, for ⌘K)  |
| `ShortcutsDialog.tsx`  | the shortcuts dialog (Figma `7426:43880`)                                          |
| `hints.ts`             | `useHintTarget(ref, action)`, the `HintRegistry`, labels, and `collectHints`       |
| `HintOverlay.tsx`      | Vim's `f`: a `HintLabel` over every target, picked by typing its label             |

## Mounting it

As built: the provider is in the root layout (`pages/root/Root.tsx`), which clears the undo stack
as a switch of workspace starts; the app-wide commands are `useAppCommands` (`pages/app/use-app-commands.ts`), called by the
workspace layout, whose ⌘\ runs the `WorkspaceShell`'s toggle through its `controlsRef` (the shell
binds no keys itself).

The provider goes in the root layout, around `ModalProvider`, as dialogs shown with `useModals`
render there and the shortcuts dialog reads the keyboard's context:

```tsx
<KeyboardProvider keymap={defaultKeymap}>
  <ModalProvider closed={switching}>…</ModalProvider>
</KeyboardProvider>
```

The workspace layout registers the app-wide commands with what they do, as the router and the
dialogs live outside this folder. An action left out (one not built yet) registers no command:

```tsx
const modals = useModals();
useCommands(
  createAppCommands({
    goTo: (page) => navigate({ to: `/app/$workspaceId/${page}`, params: { workspaceId } }),
    openShortcuts: () => modals.open((props) => <ShortcutsDialog {...props} />),
    toggleSidebar,
  }),
);
```

Pages and regions register theirs while mounted, inside the scope they apply to:

```tsx
useCommands([{ id: 'list.down', title: 'Down', scope: 'list', run: (ctx, { count = 1 }) => … }]);
return <KeyScope name="list" render={<div className={styles.list} />}>…</KeyScope>;
```

A list registers the list keys with `useListCommands(ref, actions)`, inside `<KeyScope name="list">`:
the list component exposes what the keys do through its ref (`TaskList`'s `TaskListHandle`: move
focus, select, open the status menu) and binds none itself, and the page gives what the rows do
(`open`, `setStatus`, `toggleFavorite`, `trash`). An action left out registers no command.

```tsx
const list = useRef<TaskListHandle>(null);
useListCommands(list, { open: (task) => openEntity(task), trash: (tasks) => moveToTrash(tasks) });
return (
  <KeyScope name="list">
    <TaskList ref={list} tasks={tasks} />
  </KeyScope>
);
```

A dialog the app shows is a modal scope: put `<KeyScope name="dialog">` inside its popup, so no
key outside it fires while it is open (`useConfirm` passes one as `ConfirmDialog`'s child).

A command that can be taken back returns an `Undoable` (`{ label, undo }`), which goes on the undo
stack; `app.undo` (⌘Z, registered by the provider) pops it, and a toast's Undo takes back its own
entry (`undoStack.take(entry)`). `useMoveToTrash` (`pages/app`) pushes one and shows the "Moved to
trash · Undo" toast.

## How a key is handled

1. A lone modifier is skipped.
2. With `counts` on, a digit outside a typing target or an open menu adds to the count (a leading
   `0` is a key).
3. The stroke joins the pending sequence.
4. The active scopes are walked from the innermost out (an open `dialog` scope hides everything
   outside it). The first scope with a binding that is in the current mode, allowed where the key
   was typed (`allowInTyping` for inputs and IME composition, `allowInEditor` for
   `contenteditable`, `allowInMenu` (or `allowInTyping`) in an open `role="menu"` or `"listbox"`,
   which otherwise keeps letters for its typeahead and digits for its shortcuts), and whose command
   is registered and enabled, decides: a binding the strokes
   start waits up to `sequenceTimeout` (1s) for the next stroke, then runs a binding they complete
   in that scope, if any; a binding they complete runs now.
5. Nothing matches: the sequence and count are dropped, and the key goes on to the page.

## Vim mode

Settings › General › **Vim keys** (`general.keyboardMode: 'vim'`, off by default) gives the root
layout's `KeyboardProvider` the `vimKeymap` in place of the default one; the registry and the undo
stack stay. The Vim keymap binds the same commands (`list.down`, `row.trash`, `nav.tasks`) to Vim's
keys, and a few of its own. It is a `Keymap` with:

- `modes: ['normal', 'insert', 'visual', 'hint', 'command']`, starting in Normal;
- `insertMode: 'insert'`: **the mode follows focus.** Focus in a text field or the editor puts the
  keyboard in Insert, and focus leaving it (to a row, or nowhere) takes it back to Normal. An
  element with `data-key-mode` (`MODE_ATTRIBUTE`) puts it in a mode of its own while focused (the
  `:` line's input is `data-key-mode="command"`). A mode a command set (Visual, from `v`) stays as
  focus moves between rows;
- **Esc in a field** leaves it for Normal: the dispatcher listens for Esc in the bubble phase too,
  and blurs the field (the editor's root, for `contenteditable`) only if the page left the key
  alone. A field's own Esc (cancelling an edit, closing a popup) prevents it and comes first, and a
  dialog's fields keep their Esc, which closes the dialog. Insert binds no Esc of its own;
- `counts: true` (`5j`) and `upperCaseKeys: false` (`g` and `G` differ, and the keys sheet draws
  them as typed).

`mode.set` (`SET_MODE_COMMAND_ID`, registered by the provider) puts the keyboard in `args.mode`:
Visual's and Hint's Esc bind it with `{ mode: 'normal' }`. The workspace layout shows `ModeLine`
in the shell's `statusLine` slot while the keymap has modes: the shell's `StatusLine` with the mode,
the page's title, the count and keys typed so far, and the mode's keys on the right.

**Keys in Normal mode.** Lists: `j`/`k` (and the arrows) with counts (`5j`), `gg`/`G`,
`Ctrl-d`/`Ctrl-u` (half the rows in view, `ListKeyTarget.pageSize`), `o` or ↵ to open, `x` to
select, `v` or `V` for a range, `s` for the status menu, `*` to favorite (as `f` is hints), `l`/`h`
to show and hide subtasks, and `dd` to move to trash (`3dd`: the focused row and the two after it,
`itemsFromFocus`). Everywhere: `g h`/`g t`/…, `Ctrl-o`/`Ctrl-i` back and forward, `c` for a new
task, `u` to undo, `Ctrl-r` to redo, `.` to repeat, `?` for the keys. `1`–`3` are counts in Vim;
Status picks with them once `s` has opened it, and `j`/`k` move in it (`menu.down`/`menu.up`, which
press its ↓/↑).

- **From nowhere.** With focus on no list or board (a page just opened, or Esc left a field), the
  first `j`, `k`, `gg` or `G` runs `cursor.enter`, which focuses the page's list or board at its
  focused row; the next key moves.
- **Visual.** `v` (`list.visual`) starts a range at the focused row (`ListKeyTarget.startRange`)
  and puts the keyboard in Visual; the list then selects from that row to the focused one as focus
  moves, so `j`/`k`, `gg`/`G` and half pages grow it. `x` keeps it and goes back to Normal, Esc
  drops it, and a row key (`s`, `*`, `d`) acts on it and ends it (`endRange`). A selected row's
  status menu sets the status of the whole selection.
- **The board.** `useBoardCommands(columns, actions)` registers `board.*` in the `board` scope, over
  each `BoardColumn`'s `handleRef`: `j`/`k` within a column, `h`/`l` to the next column with cards
  (at the same place, or its last), past the edge `actions.leave` (the tasks board focuses the
  sidebar's page, or an open sheet); `gg`/`G`, `o`, `*`, `dd`, and Esc to close the sheet. Once the
  sheet is open it follows the cursor (`actions.moved`).
- **Undo, redo and repeat.** An `Undoable` may have a `redo`; `UndoStack.undo` (and the toast's
  `take`) puts an entry that has one on a redo stack, `redo` (`app.redo`, `Ctrl-r`) does it again
  and puts it back, and a new entry empties the redo stack. Moving to trash redoes by moving them
  again. A keymap entry marked `repeatable` (`dd`, `*`) is remembered with its args and count when
  its keys run it, and `dispatcher.repeat(count)` (`app.repeat`, `.`) runs it again where focus is
  now, with a new count if one was typed (`3.`).
- **The which-key popup.** While a sequence is pending (`g`), the mode line lists what can follow
  in the scopes where focus is (`continuations`), as Figma's `7703:55909` does.

- **Hints.** `f` (`hints.show`) puts the keyboard in Hint mode, and the provider's `HintOverlay`
  draws a `HintLabel` over every target on screen (`collectHints`): the elements registered with
  `useHintTarget(ref, action)` (`TaskRow`, `ListRow` and the rows built on it, `BoardCard`,
  `HomeRow`, `EventRow`, each with its open), then the buttons, links, fields, tabs and menu items
  outside them, and any other `tabindex="0"` element holding no controls of its own (a calendar
  event, a card); with a dialog open, only the top-most dialog's. A registered element's own
  buttons and pills get no label, as in Figma. Labels come from the home row (`a`, `s`, … or `aa`,
  `as`, … when there are more than nine), and none starts another. Typing a whole label runs its
  target's action (a registered one, or a click; a text field is focused instead) and goes back to
  Normal; a key no label goes on with is ignored, Backspace takes one back, and Esc, a scroll or a
  resize cancels. Outside a provider `useHintTarget` does nothing, so components call it freely.

Still to build: the `:` command line, and Normal mode inside the editor (a ProseMirror plugin: the dispatcher leaves `contenteditable` alone). Not built:
`h`/`j`/`k`/`l` over the notes and projects card grids (Figma `7704:59600`), and `yy`, `i` (rename)
and `/` from the keys sheet, which have no commands yet.
