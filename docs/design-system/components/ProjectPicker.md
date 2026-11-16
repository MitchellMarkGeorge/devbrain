# ProjectPicker

Figma's `ProjectPicker`: a 240px menu with a `MenuSearch` row ("Search projects…"), then the projects with their folders in the project's colour, the current one(s) ticked on the right, a separator and "No project" (circle-slash icon) last.

- **Single** (`value: string`): the task's Project property and a note's "Change project ›"; picking closes the menu. `NO_PROJECT` is the "No project" value.
- **Multiple** (`multiple`, `value: string[]`): Filter › Project; each ticked project is kept.
- Typing filters the list by name; ↑ ↓ and Enter still drive the menu.
- **Search results** (`SearchResults` story): a page that searches for what is typed, rather than filtering what it loaded, turns the menu's filter off (`DropdownMenuFilter filter={null}`), passes the matches as `projects` with each one's highlighted title as `label` (drawn in place of `name`, which stays the item's text for type-ahead), and hides "No project" with `showNone={false}`.

`ProjectPicker` takes a `trigger` and opens the menu; inside another menu use `ProjectPickerItems` in a `DropdownMenuSubContent width="lg"`, with the `DropdownMenuSub` wrapped in a `DropdownMenuFilter`.

**Base UI:** `Menu` with `Menu.FilterProvider`, `Menu.Input`, `Menu.List`, `Menu.Empty`, and radio or checkbox items.
