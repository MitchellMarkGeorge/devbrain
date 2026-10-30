# Toast

Toasts, drawn as Figma's toasts: 356px, `popover` fill, the `edge` outline, 14px corners, 14px × 16px padding, `shadow-2xl`; title 14px medium, description 14px `muted-foreground`, a small `default` button for the action.

- `tone`: `success` (`status-completed`), `warning` (`priority-medium`), `error` (`destructive`). Offer Undo for reversible actions.

**Base UI:** `Toast.Provider`, `Toast.Viewport`, `Toast.Root`, `Toast.Title`, `Toast.Description`, `Toast.Action`, `Toast.Close` (Base UI's toasts replace shadcn's Sonner). Pass the tone as the toast `type`. Styles key off `data-type` (success, warning, error), `data-starting-style` / `data-ending-style`, `data-swiping`.
