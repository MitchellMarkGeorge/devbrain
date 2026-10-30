# Dialog

shadcn's Dialog and AlertDialog, drawn as Figma's "Delete Task?": Nova's shape: `popover` fill, the `edge` outline, 14px corners, `shadow-2xl`, 16px padding and gap, 384px wide (480px for forms), over a black/50 backdrop.

- Title 16px medium `foreground-strong`; description 14px `muted-foreground`; actions bottom right, 8px apart, in Nova's footer band (`muted` at 50% with a `border` line above): a `ghost` "Close", then the `default` or `destructive` action.
- `alert` makes it an AlertDialog (no ×). A destructive confirmation says what happens to linked items and where to recover them.

**Base UI:** `Dialog` (create task, create event) or `AlertDialog` (confirmations): `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`. Styles key off `data-open`, `data-starting-style` / `data-ending-style` on `Backdrop` and `Popup`.
