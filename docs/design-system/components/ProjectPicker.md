# ProjectPicker

Figma's `ProjectPicker`: a 240px menu with a `MenuSearch` row ("Search projects…"), then the projects with their folders in the project's colour, the current one(s) ticked on the right, a separator and "No project" (circle-slash icon) last.

- **Single** (`value: string`): the task's Project property and a note's "Change project ›"; picking closes the menu. `NO_PROJECT` is the "No project" value.
- **Multiple** (`multiple`, `value: string[]`): Filter › Project; each ticked project is kept.
- Typing filters the list by name; ↑ ↓ and Enter still drive the menu.

`ProjectPicker` takes a `trigger` and opens the menu; inside another menu use `ProjectPickerItems` in a `DropdownMenuSubContent width="lg"`, with the `DropdownMenuSub` wrapped in a `DropdownMenuFilter`.

**Base UI:** `Menu` with `Menu.FilterProvider`, `Menu.Input`, `Menu.List`, `Menu.Empty`, and radio or checkbox items.
