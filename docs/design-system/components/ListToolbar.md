# ListToolbar

The toolbar of a list page (Tasks, Projects, Notes), in a `PageToolbar`: which items are shown at
the start, how they are drawn at the end. Three pieces, all `outline` 32px buttons:

- **`ListStatusChip`** — "Status Open". First in the row and always there (a list always has a
  status scope, so the chip has no ×). Its menu is one choice: the scopes that span several
  statuses (Open, All; Active, All), a separator, then each status alone. A page with no status
  (Notes) leaves it out.
- **`ListFilters`** — a chip for each filter that is set ("Priority High" joined to its ×), then a
  quiet "+ Filter". The chip opens its field's values; × removes the filter. "+ Filter" lists every
  field's values in one menu under the field's name, with a search row once there are nine or more
  values, and "Clear filters" at its end while a filter is set. A field holds one value: ticking
  another replaces it, unticking it removes the filter.
- **`ListDisplay`** — "Display Priority". One popover: the layout as a full-width switch (List,
  Board; List, Cards), then "Group by" and "Sort by" as selects, the sort with a button for its
  direction. The button's value is what orders the page: the sort, or the layout when it orders
  itself. A layout with nothing else to set (the board) shows a line saying so (`note`) in place of
  the rows.

Rules:

- The toolbar has no "New …" button: the title bar's New creates. The exception is a project's
  Tasks tab, which keeps New Task after Display because it files the task in that project.
- Order at the start: Status, the chips in the fields' order, "+ Filter". Nothing else goes there.
- In a compact window (`compact`) Status and Display keep their names and drop their values
  (`Button`'s `hideValue`; Status draws pressed while it is off its default), and the chips fold
  into one "Filter" button whose value is how many filters are set.
- The page owns the state (its URL's search params); the pieces are controlled. A status equal to
  the page's default leaves the URL.
- `defaultOpen` draws a menu open for a picture; the app never sets it.

Stories: `Lists/ListToolbar`; in a page, `Screens/Tasks` and `Screens/Menus/Toolbar menus`.
`lists/ListToolbar/fixtures.tsx` gives stories each page's toolbar over sample choices.

**Base UI:** `Menu` (the chip menus, with `Menu.FilterProvider` for the search row), `Popover` and
`Select` (Display), `ToggleGroup` (the layout switch).
