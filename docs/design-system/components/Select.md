# Select

Picks one value from a list, Figma's `Select`: Settings values (week starts on, time zone) and the date picker's time row. The field looks like an `Input`; the list is the menu surface (see `DropdownMenu`).

- **SelectTrigger**: 32px (`sm` 28px with 8px corners), 10px side padding, 10px corners, the `input` outline on `input-fill`, 14px regular `foreground` text. It shows the chosen value, or the `placeholder` in `muted-foreground`, cut with "…", then a 16px `muted-foreground` down chevron, 6px apart. Hover tints it with `input` at 50%; keyboard focus is the `ring`; disabled fades it to 50%. Children replace the value.
- **Labels.** Pass `items` (value and label pairs) to `Select` so the trigger shows the label rather than the raw value.
- **SelectContent**: the menu surface, opened below the trigger (not over it), aligned to its start edge, 4px away, and at least as wide as the trigger (`width="trigger"`; any menu width can be passed instead). The items sit in a list inside it.
- **SelectItem**: a menu item (28px, 14px `foreground`, 8px corners), with 28px on the left for its tick: the chosen item shows a 16px `foreground` tick there (a dropdown menu's checked items tick on the right instead). An optional 16px `icon` sits before the label, which is cut with "…". Highlighted: `accent` / `accent-foreground`.
- **SelectGroup** + **SelectGroupLabel**: a group's 12px medium `muted-foreground` label (not indented to the items' text). **SelectSeparator**: the menu's 1px `border-strong` line.
- **Motion.** As every menu: it fades and zooms in from 95% in `duration-normal` on `ease-out`. Nothing moves under `prefers-reduced-motion`.

**Base UI:** `Select.Root`, `Select.Trigger`, `Select.Value`, `Select.Icon`, `Select.Portal`, `Select.Positioner` (with `alignItemWithTrigger={false}`), `Select.Popup`, `Select.List`, `Select.Item`, `Select.ItemIndicator`, `Select.ItemText`, `Select.Group`, `Select.GroupLabel`, and `Separator`. Styles key off `data-placeholder` on the value, `data-disabled` on the trigger and `data-highlighted` on items.
