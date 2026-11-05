# ContextMenu

The right-click menu: Base UI's ContextMenu drawn with `DropdownMenu`'s surface and parts. Right-clicking (or long-pressing) inside its trigger area opens the menu at the pointer, on the same `popover` surface as every menu: the `edge` outline, 10px corners, `shadow-md`, 4px padding, 224px wide, or the menu's other widths (`sm` 200px, `lg` 240px, `auto` to fit its items).

- **ContextMenuTrigger**: the area that opens the menu (a note row, a board card). A block with no look of its own: the row or card it wraps draws itself, and nothing on it says it has a menu.
- **ContextMenuContent**: the menu, aligned to the pointer by its start edge (`align`, `alignOffset`). It takes no `side` or `sideOffset`, since there is no trigger edge to sit against.
- **Items** are the dropdown menu's, under context-menu names: `ContextMenuItem` (with `icon`, `shortcut` and `variant="destructive"`), `ContextMenuCheckboxItem`, `ContextMenuRadioGroup` + `ContextMenuRadioItem`, `ContextMenuGroup` + `ContextMenuLabel`, `ContextMenuSeparator`, `ContextMenuShortcut`, and submenus (`ContextMenuSub`, `ContextMenuSubTrigger`, `ContextMenuSubContent`). They look and behave as in `DropdownMenu`; the search row is not part of it.
- **Motion.** As every menu: it fades and zooms in from 95% in `duration-normal` on `ease-out`, and back out. Nothing moves under `prefers-reduced-motion`.

A note row has no "…" button; its menu is this one: Open note (↵), Favorite (F), Change link ›, Change project ›, Copy as Markdown, then Move to trash after a separator. The task row's right-click menu (`TaskContextMenu`) is a composition in `src/renderer/components/screens/Menus/menus.tsx`.

**Base UI:** `ContextMenu.Root`, `ContextMenu.Trigger`, `ContextMenu.Portal`, `ContextMenu.Positioner`, `ContextMenu.Popup`, with `Menu`'s item parts (see `DropdownMenu`). Styles key off the same attributes as the dropdown menu's.
