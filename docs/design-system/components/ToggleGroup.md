# ToggleGroup

shadcn's ToggleGroup, drawn as DevBrain's segmented control: a 32px `background` track with a `border` line and 10px corners (Nova's size); items are 14px medium `muted-foreground`, and the chosen one takes a `secondary` thumb with 8px corners and Nova's small shadow.

- `items`: `{ value, label?, icon?, iconColor? }`; icon-only items need a `value` that reads as a name.
- Use for calendar range (Month/Week/Day), list/grid/board view and the Home quick filters. For page sections use `Tabs`.

**Base UI:** `ToggleGroup` with `Toggle` items (`@base-ui/react/toggle-group`, `toggle`). Styles key off `data-pressed` on the chosen item.
