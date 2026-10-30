# Sheet

The side panel (shadcn's Sheet), drawn as Figma's details panel: 380px, `popover` fill, the `edge` outline, 14px corners, 16px padding, a 16px medium title; a header with the panel name and "open as page" and close icon buttons.

- Use for Event Details and Task Details from the calendar or a list. Children fill the body (16px gap).

**Base UI:** `Drawer` with `swipeDirection="right"` (shadcn's Sheet becomes Base UI's Drawer): `Root`, `Portal`, `Backdrop`, `Popup`, `Title`, `Close`. Styles key off `data-open`, `data-starting-style` / `data-ending-style`, `data-swiping`.
