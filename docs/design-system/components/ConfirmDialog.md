# ConfirmDialog

The confirmation before a destructive action, as Figma's `ConfirmDialog`: an `AlertDialog` (no ×; it closes through its buttons or Esc), 384px, `popover`, the `edge` outline, 14px corners, `shadow-2xl`.

- Body (16px padding): the title, a question naming the thing (16px medium `foreground-strong`: "Delete task permanently?"), then the consequence in 14px `muted-foreground`, saying what happens to what links to it ("Its task note is kept."), and "This can’t be undone." when it can’t (`irreversible`). Header lines are 6px apart.
- Optional extras 16px below: `ConfirmDialogChoices` (a 14px medium label over radio cards: 12px padding, 10px corners, `input` fill at 30%, a `border-strong` outline, the chosen one `ring`; each a 14px medium name and a 12px consequence), or `confirmText`, a "Type “SurveyMonkey” to confirm" field that keeps the action disabled until the name matches.
- Footer band (Dialog's): a `ghost` Cancel, then the `destructive` action named verb + noun ("Delete Task", "Disconnect").

Controlled like `Dialog` (`open`, `onOpenChange`, and `onOpenChangeComplete` once its animation ends), so the app shows it with `useModals().open((props) => <ConfirmDialog {...props} …/>)`; the app's `useConfirm()` does that.

Variants in Figma: delete-task, delete-project, delete-note (irreversible), disconnect (choices: keep as local copies / remove them), delete-workspace (type the name).

**Base UI:** `AlertDialog` parts via `Dialog`'s `AlertDialog*` exports; `RadioGroup` + `Radio` for the choices (`data-checked`).
