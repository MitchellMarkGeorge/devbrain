# Tabs

shadcn's Tabs, drawn as `ToggleGroup`'s `outline` variant: separate 32px outlined buttons (10px corners, `input` outline, 14px medium `foreground`), 8px apart, with the current section filled in `accent`. Used for the Settings sections (General / Tasks / Calendar / Data & storage). `variant="default"` is the segmented control, drawn and sized exactly as `ToggleGroup`'s (see its guide). `variant="line"` draws a 2px `foreground` underline on the active tab over a `border` line the width of the row, its labels in `muted-foreground` (`foreground-strong` when active or hovered): an item's sub-pages at the top of its page (a project's Overview / Tasks / Notes), at `size="lg"`.

- **`size="lg"`**: outline, 36px tabs (`control-lg`) in 16px medium, 14px in from their sides, with their 16px icons; line, 14px medium labels with their 16px icons, 24px apart, 10px above the underline (a project's Overview / Tasks / Notes). Settings' sections keep the default.
- `items`, `defaultValue`, `variant` (`outline` by default for sections, or `line`), `size` (`default` or `lg`).

**Base UI:** `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`; the `line` variant can draw its underline with `Tabs.Indicator`. Styles key off `data-active` on the selected tab.
