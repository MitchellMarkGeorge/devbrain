# Dialog

shadcn's Dialog and AlertDialog, drawn as Figma's "Delete Task?": Nova's shape: `popover` fill, the `edge` outline, 14px corners, `shadow-2xl`, 16px padding and gap, 384px wide (480px for forms), over a black/50 backdrop. It sits 160px from the window's top, centred on the whole window, ignoring the sidebar.

- Title 16px medium `foreground-strong`; description 14px `muted-foreground`, 6px below; actions bottom right, 8px apart, in Nova's footer band (`muted` at 50% with a `border-strong` line above): a `ghost` "Cancel" (or "Close"), then the `default` or `destructive` action. Never `primary`.
- `alert` makes it an AlertDialog (no ×). Destructive confirmations use `ConfirmDialog`, which says what happens to linked items and whether it can be undone.

- **Motion.** Opening fades the dialog in as it rises 8px and grows from 96% (from its top edge), while the backdrop fades in, in `duration-slow` on `ease-surface`; closing plays it back. The ⌘K search, create dialogs and confirmations move the same way. Nothing moves under `prefers-reduced-motion`.

**Base UI:** `Dialog` (create task, create event) or `AlertDialog` (confirmations): `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`. Styles key off `data-open`, `data-starting-style` / `data-ending-style` on `Backdrop` and `Popup`.
