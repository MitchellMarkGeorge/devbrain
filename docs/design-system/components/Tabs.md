# Tabs

shadcn's Tabs, drawn like `ToggleGroup` (the Settings sections, at 14px), plus a `line` variant for an item's sub-pages (project Overview / Tasks / Notes): 14px medium labels, a 2px `foreground` underline on the active one, `border` beneath.

- `items`, `defaultValue`, `variant`.

**Base UI:** `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`; the `line` variant can draw its underline with `Tabs.Indicator`. Styles key off `data-active` on the selected tab.
