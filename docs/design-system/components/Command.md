# Command

The command palette on the menu surface: a 32px search row over grouped results, group labels 12px medium `muted-foreground`, items like menu items.

- Use for the editor's slash menu (grouped "Basic blocks", "List blocks", "Media", "Others"), "Link to…", the project picker and ⌘K search.

**Base UI:** `Autocomplete` in a `Dialog`, following Base UI's command-palette pattern (it replaces shadcn's cmdk). Project and note pickers that set a value use `Combobox`. Styles key off `data-highlighted` on items.
