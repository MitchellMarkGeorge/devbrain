# ListToolbar

The toolbar of a list page (Tasks, Projects, Notes), in a `PageToolbar`: which items are shown at
the start, how they are drawn at the end. Three pieces, all `outline` 32px buttons:

- **`ListStatusChip`** — "Status Open". First in the row and always there (a list always has a
  status scope, so the chip has no ×). Its menu is one choice: the scopes that span several
  statuses (Open, All; Active, All), a separator, then each status alone. A page with no status
  (Notes) leaves it out.
- **`ListFilters`** — a chip for each filter that is set ("Priority High" joined to its ×), then a
  quiet "+ Filter". A chip's value opens its field's values; its × removes the filter; a long value
  is cut with "…". The "+ Filter" menu has an item for each field, with what the field is
  filtered to before its chevron ("Priority High ›"), opening the field's values in a submenu:
  "Any" first, which removes the filter. A field whose values are the user's own (projects) gets a
  search row in its menus (`search`) and draws each value's own glyph (a project's folder in its
  colour). "Clear filters" ends the menu while a filter is set.
- **`ListDisplay`** — "Display Priority". One popover: the layout as a full-width switch (List,
  Board; List, Cards), then "Group by" and "Sort by" as selects, the sort with a button for its
  direction. The button's value is what orders the page: the sort, or the layout when it orders
  itself. A layout with nothing else to set (the board) shows a line saying so (`note`) in place of
  the rows.

A field holds one value or several (`ListFilterField`):

- **One value** (the default: Due, Source). Its values are a choice of one (radio items); picking
  one closes the menu. `value` is the value or `undefined`.
- **Several values** (`multiple: true`: Priority, Project, a note's Linked to), meaning "any of
  these". Its values tick on their own (checkbox items) and the menu stays open for the next one;
  "Any" in the submenu unticks them all and closes it. `value` is a list, empty when the filter is
  not set, and `onChange` gets the new list in the options' order. Unticking the last value removes
  the chip. The chip and the menu's item show the same summary: one value's label ("High"), two
  side by side ("High, Medium"), and from three the first and how many more ("High +2"). The text
  is cut with "…" when it is long; "+2" never is.

A field is one filter however many values it holds: one chip, and one in the counts "Filter 2" and
"Filter +2".

Rules:

- The toolbar has no "New …" button: the title bar's New creates. The exception is a project's
  Tasks tab, which keeps New Task after Display because it files the task in that project.
- Order at the start: Status, the chips in the fields' order, "+ Filter", then "Clear" at the
  row's end. Nothing else goes there.
- The toolbar is always one row. `ListFilters` takes the room left after Status and measures it:
  the chips that fit are drawn, and the rest fold into the trailing button, which becomes an
  outlined "Filter +2" (two more filters than the chips shown). A folded filter is still in the
  menu, beside its field's name, and comes back as a chip when there is room (the window widens, or
  a chip before it is removed). Chips fold from the end, in the fields' order.
- While a filter is set, a quiet "Clear" sits at the end of the filters' row, just before Display,
  and removes them all. It is at the row's end, not after "+ Filter", so it stays in one place as
  chips come and go; it also clears the folded ones. It shows with one filter too: that repeats the
  chip's × in a wide window, but it is the convention, it doesn't pop in at the second filter, and
  in a compact window (where the chip is folded) it is the only one-click way out. It leaves Status
  alone, as "Clear filters" in the menu does.
- A chip is a `ButtonGroup` of two outline buttons. (`ButtonGroup` squares corners by `data-slot`,
  not by position, so the chip keeps its shape while its menu is open.)
- A folded chip stays in the row, unseen and absolutely positioned, so it takes no room but keeps
  its own width. How many chips fit is then counted from the page as it is each time the filters or
  the row's width change, with no widths remembered that could go stale. Being unseen also takes a
  folded chip out of the accessibility tree and the tab order.
- In a compact window (`compact`) Status and Display keep their names and drop their values
  (`Button`'s `hideValue`; Status draws pressed while it is off its default), and every chip folds:
  the button reads "Filter 2", how many filters are set.
- The page owns the state (its URL's search params); the pieces are controlled. A status equal to
  the page's default leaves the URL.
- `defaultOpen` draws a menu open for a picture; the app never sets it.

Stories: `Lists/ListToolbar`; in a page, `Screens/Tasks` and `Screens/Menus/Toolbar menus`.
`lists/ListToolbar/fixtures.tsx` gives stories each page's toolbar over sample choices.

**Base UI:** `Menu` (Status, the chips and "+ Filter", with `Menu.SubmenuRoot` for a field and `Menu.FilterProvider` for its
search row), `Popover` and
`Select` (Display), `ToggleGroup` (the layout switch).
