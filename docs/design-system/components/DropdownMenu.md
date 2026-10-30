# DropdownMenu

The dropdown menu (shared by context menus and Select), drawn as in Figma: `popover` with the `edge` outline, 10px corners, `shadow-md`, 4px padding, 224px wide (180px for short menus).

- Items (Nova): 28px, 8px corners, 6px side padding, a 16px `muted-foreground` icon and a 14px `foreground` label; the highlighted item takes `accent` and `accent-foreground`.
- Group labels 12px medium `muted-foreground` ("Turn into"); separators are `border` lines; shortcuts sit right in 12px `muted-foreground` with wide tracking (`#`, `-`, `---`).
- `destructive` items ("Delete") use `destructive` text and go last.

**Base UI:** `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`, `Menu.Group` + `Menu.GroupLabel`, `Menu.Separator`, `Menu.CheckboxItem`, `Menu.SubmenuRoot` + `Menu.SubmenuTrigger`. Right-click menus use `ContextMenu` with the same parts; sort and option pickers use `Select` (items get `data-selected`). Styles key off `data-highlighted` on items, `data-checked` on checkbox items, `data-popup-open` on submenu triggers, `data-open` / `data-starting-style` / `data-ending-style` on the popup.
