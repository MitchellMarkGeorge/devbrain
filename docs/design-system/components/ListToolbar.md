# ListToolbar

The toolbar of a list page (Tasks, Projects, Notes), in a `PageToolbar`: which items are shown at
the start, the controls that change that and how they are drawn at the end. Four pieces, all
`outline` 32px buttons:

- **`ListStatusChip`** — "Status Open". First in the row and always there (a list always has a
  status scope, so the chip has no ×). Its menu is one choice: the scopes that span several
  statuses (Open, All; Active, All), a separator, then each status alone. Notes have no status:
  their chip is the note's type, "Type All" (`label="Type"`), with All, then Standalone, Task
  notes and Event notes (what the note is linked to). So every list page starts with one chip
  that picks one value, and it is not one of the filters: "Clear" leaves it alone.
- **`ListFilters`** — at the start, after Status: a chip for each filter that is set. A chip is
  "Priority High, Medium" joined to its ×: its value opens its field's values straight away (no
  "Any": the × removes the filter); a long value is cut with "…". The chips are in the fields'
  order, whatever order they were set in. With no filter set it draws nothing.
- **`ListFilterButton`** — at the end, before Display: the Filter button, an outline icon button
  (`IconButton`, the filter icon, named "Filter" in its tooltip), the same whatever is set. Its
  menu has an item for each field, with what the field is filtered to before its chevron
  ("Priority High ›"), opening the field's values in a submenu: "Any" first, which removes the
  filter. A field whose values are the user's own (projects) gets a search row in its menus
  (`search`) and draws each value's own glyph (a project's folder in its colour). "Clear filters"
  ends the menu while a filter is set. A page gives both pieces the same fields.
- **`ListDisplay`** — "Display Priority". One popover: the layout as a full-width switch (List,
  Board; List, Cards), then "Group by" and "Sort by" as selects, the sort with a button for its
  direction. The button's value is what orders the page: the sort, or the layout when it orders
  itself. A layout with nothing else to set (the board) shows a line saying so (`note`) in place of
  the rows.

A field holds one value or several (`ListFilterField`):

- **One value** (the default: Due, Source). Its values are a choice of one: radio items, each
  drawing a radio button. `value` is the value or `undefined`.
- **Several values** (`multiple: true`: Priority, Project), meaning "any of
  these". Its values tick on their own: checkbox items, each drawing a checkbox. "Any" in the
  submenu unticks them all. `value` is a list, empty when the filter is not set, and `onChange`
  gets the new list in the options' order. Unticking the last value removes the filter and its
  chip. The chip, the menu's item and the tooltip summarise it the same way: one value's label
  ("High"), two side by side ("High, Medium"), and from three the first and how many more
  ("High +2"). The text is cut with "…" when it is long; "+2" never is.

A value's control comes before its icon (`DropdownMenu`'s `indicator="control"`), so the kind of
choice shows before anything is picked. Picking a value never closes the menu, in either kind of
field: several values, and then other fields, are set in one visit, and the list behind the menu
updates as they are. The menu closes on Escape or a click outside it.

A field is one filter however many values it holds: one chip.

Rules:

- The toolbar has no "New …" button: the title bar's New creates. The exception is a project's
  Tasks tab, which keeps New Task after Display because it files the task in that project.
- Order at the start: Status, the chips, "+2" for the chips that don't fit, then "Clear" at the
  row's end. At the end: the Filter button, then Display. Nothing else goes in either.
- The Filter button is with Display, away from the chips, and never changes: adding a filter
  draws its chip at the other end of the row, so the button does not move and its menu stays under
  the pointer while values are ticked.
- The toolbar is always one row. `ListFilters` takes the room left after Status and measures it:
  the chips that fit are drawn, and the rest are hidden, from the end, behind an outline "+2" after
  the last chip shown (how many are hidden). Its menu has the hidden fields, each opening its
  values in a submenu, so a hidden filter is still two clicks away; it comes back as a chip when
  there is room (the window widens, or a chip before it is removed).
- A hidden chip stays in the row, unseen and absolutely positioned, so it takes no room but keeps
  its own width. How many chips fit is then counted from the page as it is each time the filters or
  the row's width change, with no widths remembered that could go stale. Being unseen also takes a
  hidden chip out of the accessibility tree and the tab order.
- A chip is a `ButtonGroup` of two outline buttons. (`ButtonGroup` squares corners by `data-slot`,
  not by position, so the chip keeps its shape while its menu is open.)
- While a filter is set, a quiet "Clear" sits at the end of the filters' row, just before Display,
  and removes them all, the hidden ones too, as "Clear filters" in the menu does. It leaves
  Status alone.
- In a compact window (`compact`) Status and Display keep their names and drop their values
  (`Button`'s `hideValue`; Status draws pressed while it is off its default), which leaves the
  chips more room.
- The page owns the state (its URL's search params); the pieces are controlled. A status equal to
  the page's default leaves the URL.
- `defaultOpen` draws a menu open for a picture; the app never sets it.

Stories: `Lists/ListToolbar`; in a page, `Screens/Tasks` and `Screens/Menus/Toolbar menus`.
`lists/ListToolbar/fixtures.tsx` gives stories each page's toolbar over sample choices.

**Base UI:** `Menu` (Status, Filter and the chips, with `Menu.SubmenuRoot` for a field and `Menu.FilterProvider` for its
search row), `Popover` and
`Select` (Display), `ToggleGroup` (the layout switch).
