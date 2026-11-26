# ListToolbar

The toolbar of a list page (Tasks, Projects, Notes), in a `PageToolbar`: which items are shown at
the start, how they are drawn at the end. Three pieces, all `outline` 32px buttons:

- **`ListStatusChip`** — "Status Open". First in the row and always there (a list always has a
  status scope, so the chip has no ×). Its menu is one choice: the scopes that span several
  statuses (Open, All; Active, All), a separator, then each status alone. A page with no status
  (Notes) leaves it out.
- **`ListFilters`** — the Filter button: an outline icon button (`IconButton`, the filter icon),
  with a badge on its top right corner counting the filters that are set, and none while nothing
  is. Its tooltip is "Filter", or with filters set what each is filtered to, one to a line
  ("Priority: High, Medium"). Its menu has an item for each field, with what the field is filtered
  to before its chevron ("Priority High ›"), opening the field's values in a submenu: "Any" first,
  which removes the filter. A field whose values are the user's own (projects) gets a search row
  in its submenu (`search`) and draws each value's own glyph (a project's folder in its colour).
  "Clear filters" ends the menu while a filter is set. No filter is drawn in the row itself: the
  badge says how many there are, and the tooltip and the menu say which.
- **`ListDisplay`** — "Display Priority". One popover: the layout as a full-width switch (List,
  Board; List, Cards), then "Group by" and "Sort by" as selects, the sort with a button for its
  direction. The button's value is what orders the page: the sort, or the layout when it orders
  itself. A layout with nothing else to set (the board) shows a line saying so (`note`) in place of
  the rows.

A field holds one value or several (`ListFilterField`):

- **One value** (the default: Due, Source). Its values are a choice of one: radio items, each
  drawing a radio button. `value` is the value or `undefined`.
- **Several values** (`multiple: true`: Priority, Project, a note's Linked to), meaning "any of
  these". Its values tick on their own: checkbox items, each drawing a checkbox. "Any" in the
  submenu unticks them all. `value` is a list, empty when the filter is not set, and `onChange`
  gets the new list in the options' order. Unticking the last value removes the filter. The menu's
  item and the tooltip summarise it: one value's label ("High"), two side by side
  ("High, Medium"), and from three the first and how many more ("High +2"). The text is cut with
  "…" when it is long; "+2" never is.

A value's control comes before its icon (`DropdownMenu`'s `indicator="control"`), so the kind of
choice shows before anything is picked. Picking a value never closes the menu, in either kind of
field: several values, and then other fields, are set in one visit, and the list behind the menu
updates as they are. The menu closes on Escape or a click outside it.

A field is one filter however many values it holds: one in the badge's count.

Rules:

- The toolbar has no "New …" button: the title bar's New creates. The exception is a project's
  Tasks tab, which keeps New Task after Display because it files the task in that project.
- Order at the start: Status, the Filter button, then "Clear" at the row's end. Nothing else goes
  there.
- The toolbar is always one row, and the Filter button is the same size whatever is set, so it
  never moves: its menu stays under the pointer while values are ticked. The badge is the page's
  `primary` on a ring of the page's colour, 16px, and is hidden from a screen reader, whose name
  for the button carries the count instead ("Filter, 2 set").
- While a filter is set, a quiet "Clear" sits at the end of the filters' row, just before Display,
  and removes them all, as "Clear filters" in the menu does. It leaves Status alone.
- In a compact window (`compact`) Status and Display keep their names and drop their values
  (`Button`'s `hideValue`; Status draws pressed while it is off its default). The Filter button is
  as it always is.
- The page owns the state (its URL's search params); the pieces are controlled. A status equal to
  the page's default leaves the URL.
- `defaultOpen` draws a menu open for a picture; the app never sets it.

Stories: `Lists/ListToolbar`; in a page, `Screens/Tasks` and `Screens/Menus/Toolbar menus`.
`lists/ListToolbar/fixtures.tsx` gives stories each page's toolbar over sample choices.

**Base UI:** `Menu` (Status and Filter, with `Menu.SubmenuRoot` for a field and `Menu.FilterProvider` for its
search row), `Popover` and
`Select` (Display), `ToggleGroup` (the layout switch).
