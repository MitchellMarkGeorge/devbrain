# EntityHoverCard

The preview that opens on pointing at an entity pill (shadcn's HoverCard): 280px, on `popover` with the `edge` outline, 10px corners, `shadow-md` and 12px padding, 10px between its parts.

- **Timing:** it opens after about 400ms of pointing at the pill, so moving across a row doesn't flash cards, and sits 4px below the pill (flipping above or aligning to the pill's right edge near the window's edges). It stays while the pointer is on the pill or the card, and closes on leaving or Esc. Keyboard focus on a pill opens it too.
- **A preview, not a menu:** clicking the pill still opens the item. The card carries only what helps decide whether to open it, plus the one or two actions worth taking from where you are.
- **Header:** the pill's own glyph (folder in the project's colour, the calendar's 16px `ColourBar`, file icon, status icon, provider logo) and the item's name in 14px medium `foreground-strong`, ending in "…".
- **By type:**
  - **Project:** a status pill and the due date, then a progress bar over "25%" on the left and "3 of 12 tasks done" on the right.
  - **Event:** time, how it repeats and the location as quiet lines with their icons, then Join when it has a meeting link.
  - **Note:** "Edited 2h ago · project", then a two-line `subtle-foreground` preview.
  - **Task** (a subtask's parent): priority and due date pills with the key, then subtask progress.
  - **Source** (a synced task's key): the item's state at the provider and the sync time, then "Open in Linear" and "Copy URL".

**Base UI:** `PreviewCard` (shadcn's HoverCard on Base UI): `Root`, `Trigger` (the pill), `Portal`, `Positioner` (`sideOffset={4}`), `Popup`. Open and close delays via `delay` / `closeDelay`. Styles key off `data-open`, `data-side`, `data-starting-style` / `data-ending-style`.
