# Keyboard layer

Commands, scopes, keymaps and one dispatcher, so the app's keys are data and a Vim mode is a second
keymap rather than a rewrite. The plan is in `docs/renderer/implementation-plan.md` ("Keyboard:
commands, keymaps and Vim mode"). Not mounted in the app yet; `Keyboard/KeyboardLayer` in Storybook
mounts it with a demo keymap.

| File                   | What it holds                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `commands.ts`          | `Command`, `CommandContext`, and the `CommandRegistry`                             |
| `undo.ts`              | `Undoable` and the app's `UndoStack`                                               |
| `scopes.ts`            | the scope stack, and `activeScopes` (read from the DOM around the focused element) |
| `keymap.ts`            | `Keymap` and `KeymapEntry`: bindings as data                                       |
| `keys.ts`              | key notation (`mod+k`, `g t`): parsing, reading `keydown`s, and labels for `Kbd`   |
| `dispatcher.ts`        | `KeyDispatcher`: the one capture-phase `keydown` listener, with no React in it     |
| `KeyboardProvider.tsx` | the provider and hooks: `useCommands`, `useKeyboardState`, `useUndoStack`, …       |
| `KeyScope.tsx`         | `<KeyScope name>`: makes a subtree a scope while focus is inside it                |
| `default-keymap.ts`    | the keymap DevBrain ships with, and `createAppCommands(actions)`                   |
| `shortcuts.ts`         | the shortcuts dialog's sections, from the active keymap                            |
| `ShortcutsDialog.tsx`  | the shortcuts dialog (Figma `7426:43880`)                                          |
| `hints.ts`             | `useHintTarget(ref, action)`: a no-op until Vim's `f` hints                        |

## Mounting it

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

A command that can be taken back returns an `Undoable` (`{ label, undo }`), which goes on the undo
stack; `app.undo` (registered by the provider) and the toast's Undo button pop it.

## How a key is handled

1. A lone modifier is skipped.
2. With `counts` on, a digit outside a typing target adds to the count (a leading `0` is a key).
3. The stroke joins the pending sequence.
4. The active scopes are walked from the innermost out (an open `dialog` scope hides everything
   outside it). The first scope with a binding that is in the current mode, allowed where the key
   was typed (`allowInTyping` for inputs and IME composition, `allowInEditor` for
   `contenteditable`), and whose command is registered and enabled, decides: a binding the strokes
   start waits up to `sequenceTimeout` (1s) for the next stroke, then runs a binding they complete
   in that scope, if any; a binding they complete runs now.
5. Nothing matches: the sequence and count are dropped, and the key goes on to the page.

## Adding Vim

A Vim keymap is a `Keymap` with `modes: ['normal', 'insert', 'visual', 'command']`, `counts: true`
and `upperCaseKeys: false`, binding the same commands (`list.down`, `row.trash`, `nav.tasks`) to
other keys, and a few of its own (`mode.insert` calling `ctx.setMode('insert')`). The setting
`general.keyboardMode` picks which keymap the provider gets. The `VimSketch` story shows one. What
is still to build for it, none of which changes the layer:

- the mode commands, and entering Insert mode when focus moves into a text field;
- a status line and a which-key popup, from `useKeyboardState()` (`mode`, `pending`, `count`);
- the `:` command line, running `useCommandList()`'s commands through `dispatcher.run`;
- `f` hints, filling in `useHintTarget`;
- Normal mode inside the editor, as a ProseMirror plugin: the dispatcher leaves `contenteditable`
  alone.
