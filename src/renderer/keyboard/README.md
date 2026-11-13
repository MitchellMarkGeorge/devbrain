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
| `shortcuts.ts`         | the shortcuts dialog's sections, and a command's keys (`commandShortcut`, for ⌘K)  |
| `ShortcutsDialog.tsx`  | the shortcuts dialog (Figma `7426:43880`)                                          |
| `hints.ts`             | `useHintTarget(ref, action)`: a no-op until Vim's `f` hints                        |

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

In Normal mode the list keys are `j`/`k` (and the arrows), `gg`/`G`, `o` or ↵ to open, `x` to
select, `s` for the status menu, `*` to favorite (as `f` is hints), `l`/`h` to show and hide
subtasks and `dd` to move to trash; everywhere, `g h`/`g t`/…, `c` for a new task, `u` to undo and
`?` for the keys. `1`–`3` are counts in Vim; Status picks with them once `s` has opened it.

Still to build: Visual ranges, `Ctrl-d`/`Ctrl-u`, redo and `.`, the board, the which-key popup, `f`
hints (filling in `useHintTarget`), the `:` command line, and Normal mode inside the editor (a
ProseMirror plugin: the dispatcher leaves `contenteditable` alone).
