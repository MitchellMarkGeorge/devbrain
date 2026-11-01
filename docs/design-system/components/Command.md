# Command

The command palette on the menu surface: a 32px search row over grouped results, group labels 12px medium `muted-foreground`, items like menu items.

- ⌘K search: the search row, then the type filter (All / Tasks / Notes / Projects / Events) as `ToggleGroup`'s `outline` variant with each type's icon and result count, with no divider above or below it. Result groups take an uppercase 12px `muted-foreground` label (0.5px tracking) and a count badge (12px `muted-foreground` on `accent`, 4px corners); link groups such as "Go to" have no count.
- Use for the editor's slash menu (grouped "Basic blocks", "List blocks", "Media", "Others"), "Link to…", the project picker and ⌘K search.

**Base UI:** `Autocomplete` in a `Dialog`, following Base UI's command-palette pattern (it replaces shadcn's cmdk). Project and note pickers that set a value use `Combobox`. Styles key off `data-highlighted` on items.
