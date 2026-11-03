# Sheet

The details panel for a task or an event (shadcn's Sheet): `popover` fill, 16px padding, a 16px medium title, and a header with the panel name and "open as page" and close icon buttons. Children fill the body (16px gap). 380px (`sheet-width`) for task and event details, 480px for an event's note.

- **Docked by default.** The sheet opens as a full-height column on the right, separated from the page by a `border` line, with square corners and no shadow. The page narrows to make room, so nothing the user was looking at is hidden: board columns narrow, the week grid's day columns narrow (all seven days stay), and the calendar's right panel (mini calendar, Today, Tomorrow) hides while a sheet is open. Opening another item switches the sheet's content.
- **Overlay when the window is narrow.** When docking would squeeze the page below about 640px, the sheet floats over the page instead: inset 8px, 14px corners, the `edge` outline and `shadow-2xl` (`overlay`).
- Use for Task Details from the board or a list, and Event Details or an event's note from the calendar. Dialogs opened from a sheet still float over everything.

**Base UI:** `Drawer` with `swipeDirection="right"` (shadcn's Sheet becomes Base UI's Drawer): `Root`, `Portal`, `Backdrop`, `Popup`, `Title`, `Close`. Docked, it renders without the `Backdrop` and the page shrinks beside it; as an overlay it is modal. Styles key off `data-open`, `data-starting-style` / `data-ending-style`, `data-swiping`.
