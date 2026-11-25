# ListToolbar

The toolbar of a list page (Tasks, Projects, Notes), in a `PageToolbar`: which items are shown at
the start, how they are drawn at the end. Three pieces, each one `outline` 32px button:

- **`ListStatusChip`** — "Status Open". First in the row and always there (a list always has a
  status scope, so the chip has no ×). Its menu is one choice: the scopes that span several
  statuses (Open, All; Active, All), a separator, then each status alone. A page with no status
  (Notes) leaves it out.
- **`ListFilters`** — one "Filter" button, however many filters are set: it names the one that
  is set ("Filter High") or counts them ("Filter 3"), a long value cut with "…". Its menu has an
  item for each field, with the value the field is filtered to before its chevron ("Priority
  High ›"), opening the field's values in a submenu: "Any" first, which removes the filter. A field
  whose values are the user's own (projects) gets a search row in its submenu (`search`), and
  draws each value's own glyph (a project's folder in its colour). "Clear filters" ends the menu
  while a filter is set. A field holds one value.
- **`ListDisplay`** — "Display Priority". One popover: the layout as a full-width switch (List,
  Board; List, Cards), then "Group by" and "Sort by" as selects, the sort with a button for its
  direction. The button's value is what orders the page: the sort, or the layout when it orders
  itself. A layout with nothing else to set (the board) shows a line saying so (`note`) in place of
  the rows.

Rules:

- The toolbar has no "New …" button: the title bar's New creates. The exception is a project's
  Tasks tab, which keeps New Task after Display because it files the task in that project.
- Order at the start: Status, then Filter. Filters that are set never add controls to the row, so
  the toolbar keeps its shape and cannot grow into Display.
- In a compact window (`compact`) the three buttons keep their names and drop their values
  (`Button`'s `hideValue`); Status draws pressed while it is off its default, and Filter while a
  filter is set.
- The page owns the state (its URL's search params); the pieces are controlled. A status equal to
  the page's default leaves the URL.
- `defaultOpen` draws a menu open for a picture; the app never sets it.

Stories: `Lists/ListToolbar`; in a page, `Screens/Tasks` and `Screens/Menus/Toolbar menus`.
`lists/ListToolbar/fixtures.tsx` gives stories each page's toolbar over sample choices.

**Base UI:** `Menu` (Status and Filter, with `Menu.SubmenuRoot` for a field and `Menu.FilterProvider` for its
search row), `Popover` and
`Select` (Display), `ToggleGroup` (the layout switch).
