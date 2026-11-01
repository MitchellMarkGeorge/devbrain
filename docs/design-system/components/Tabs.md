# Tabs

shadcn's Tabs, drawn as `ToggleGroup`'s `outline` variant: separate 32px outlined buttons (10px corners, `input` outline, 14px medium `foreground`), 8px apart, with the current section filled in `accent`. Used for the Settings sections (General / Tasks / Calendar / Data & storage) and an item's sub-pages (project Overview / Tasks / Notes). A `line` variant (2px `foreground` underline on the active tab, `border` beneath) remains available but no screen uses it.

- `items`, `defaultValue`, `variant` (`outline` by default for sections, or `line`).

**Base UI:** `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`; the `line` variant can draw its underline with `Tabs.Indicator`. Styles key off `data-active` on the selected tab.
