# Popover

shadcn's Popover: the floating surface the date pills open (`DatePicker`, `DateRangePicker`) and the sidebar rail's Recents and Favorites. `popover` fill and `popover-foreground` text, the `edge` outline, 10px corners, `shadow-md`, never wider than the window less 16px.

- **Sizes.** `default`: 288px with 10px padding, for a title and a description. `auto`: as wide as its content with no padding, for content that draws its own insets (a `Calendar`, a date picker, a list).
- **Placement.** Portalled over the page, below its trigger, aligned to the trigger's start edge, 4px away. `side`, `align`, `sideOffset` and `alignOffset` move it (the sidebar rail opens its popovers to the right, 8px off).
- **PopoverTitle**: 14px medium `foreground-strong`. **PopoverDescription**: 14px `muted-foreground`. Neither adds space around itself; stack them (4px apart in the stories).
- **PopoverTrigger** renders as the control that opens it through `render` (a `Button`, a `Badge`, an `EntityPill`). **PopoverClose** closes it.
- **Motion.** It fades and zooms in from 95%, from its trigger's side, in `duration-normal` on `ease-out`, and back out on closing. Nothing moves under `prefers-reduced-motion`.

`EntityHoverCard` is not a popover: it uses Base UI's `PreviewCard`.

**Base UI:** `Popover.Root`, `Popover.Trigger`, `Popover.Portal`, `Popover.Positioner`, `Popover.Popup`, `Popover.Title`, `Popover.Description`, `Popover.Close`. Styles key off `data-starting-style` / `data-ending-style` on the popup.
