# DropdownMenu

The dropdown menu (shared by context menus, the value pickers and Select), drawn as Figma's `Menus` section: `popover` with the `edge` outline, 10px corners, `shadow-md`, 4px padding. 224px wide; `sm` 200px for short menus (status, priority, sort, group by, filter, trash row, project); `lg` 240px for pickers with a search.

- **MenuItem** (Nova): 28px, 8px corners, 6px side padding, 6px gap, a 16px `muted-foreground` icon and a 14px `foreground` label. The icon may be a node (`StatusIcon`, `PriorityIcon`, a project's coloured folder), which keeps its own colour. Highlighted: `accent` / `accent-foreground`. Disabled: `subtle-foreground` text (not faded). `destructive` ("Move to trash", "Delete permanently"): `destructive` text and icon, last in the menu.
- **Shortcut** on the right: 12px `subtle-foreground` with wide tracking (`↵`, `F`, `⌘D`, `⌘⌫`, `⇧2`), written as on macOS and named for the platform (`Ctrl+D`, `Ctrl+Backspace`, `Shift+2` on Windows and Linux); `muted-foreground` while the item is highlighted.
- **Checked** (radio and checkbox items: sort by, group by, a filter's values, the current status; and `Select`'s chosen option): a 16px tick on the right, in place of the shortcut. No left inset.
- **Submenu** ("Status ›"): a chevron on the right, optionally after the current `value` in 12px `muted-foreground`.
- **MenuLabel**: a group's 12px medium `muted-foreground` label, 24px ("Sort by", "Order", "Filter").
- **MenuSeparator**: a 1px `border-strong` line with 4px above and below, inside the menu's padding (a `border` line would vanish on the popover).
- **MenuSearch** (`DropdownMenuSearch`): the search row at the top of a picker menu, 36px, 8px insets, a search icon and a 14px input over a `border-strong` line, 4px above the first item. It filters the `DropdownMenuList`'s items by their text; wrap the menu or submenu in `DropdownMenuFilter`. `DropdownMenuEmpty` shows when nothing matches.
- Items take the pointer cursor, like every other control; so do Select options and Command items.

The specific menus (task right-click, note, project, trash row, link pill, sort, group by, filter and its submenus, the pages' "…" menus) are compositions of these parts, not components: see `src/renderer/components/screens/Menus/menus.tsx`. `StatusMenu`, `PriorityMenu` and `ProjectPicker` are the value pickers built on them.

**Base UI:** `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`, `Menu.Group` + `Menu.GroupLabel`, `Menu.Separator`, `Menu.CheckboxItem`, `Menu.RadioGroup` + `Menu.RadioItem`, `Menu.SubmenuRoot` + `Menu.SubmenuTrigger`, `Menu.FilterProvider` + `Menu.Input` + `Menu.List` + `Menu.Empty` for the search. Right-click menus use `ContextMenu` with the same parts; option pickers in forms use `Select`. Styles key off `data-highlighted`, `data-disabled` and `data-checked` on items, `data-popup-open` on submenu triggers, `data-starting-style` / `data-ending-style` on the popup.

**Height and scrolling.** A menu is no taller than 420px (320px for a picker with a search row, `width: 'lg'`) or the room the window has beside its trigger. Past that its items scroll in a `ScrollArea` inside the surface (`MenuScrollArea`), the thin scrollbar drawn over the edge, and a picker's search row stays pinned at the top while the rows scroll under it. `ContextMenu` and `Select` draw their content the same way; `Command`'s list scrolls in its own `ScrollArea`.
