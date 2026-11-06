# EntityHoverCard

The preview that opens on pointing at an entity pill (shadcn's HoverCard): 280px, on `popover` with the `edge` outline, 10px corners, `shadow-md` and 12px padding, 10px between its parts.

- **Timing:** it opens after about 400ms of pointing at the pill, so moving across a row doesn't flash cards, and sits 4px below the pill (flipping above or aligning to the pill's right edge near the window's edges). It stays while the pointer is on the pill or the card, and closes on leaving or Esc. Keyboard focus on a pill opens it too.
- **A preview, not a menu:** clicking the pill still opens the item. The card carries only what helps decide whether to open it, plus the one or two actions worth taking from where you are.
- **Data:** `entity`, a `HoverCardEntity`: core's row for the item with its `type` (`project`, `event`, `note`, `task`, `source`), each a `Pick` of the fields it shows (a project's `stats` from `projects.stats`, a task's `subtaskProgress` and `external`, a note's `preview`, `updatedAt` and `project`, an event's times, `location` and `recurrenceRule`, a source's `external`). The card words its pills, meta lines, preview and progress itself, with `useFormat()`. `actions` holds its one or two xs buttons (Join, Open in Linear, Copy URL).
- **Header:** the pill's own glyph (folder in the project's colour, the calendar's 16px `ColourBar`, file icon, status icon (the overdue flag while an overdue task is not started), provider logo) and the item's name (a source's key first: "ENG-124 · Fix the token refresh race") in 14px medium `foreground-strong`, ending in "…".
- **By type:**
  - **Project:** a status pill and the due date ("Due Jul 1"), then, with `stats`, a progress bar over "25%" on the left and "3 of 12 tasks done" on the right.
  - **Event:** its day and time ("Today, 10:00 – 10:30 AM"), how it repeats and the location as quiet lines with their icons, then Join (passed in `actions`) when it has a meeting link.
  - **Note:** "Edited 2h ago · project", then a two-line `subtle-foreground` preview.
  - **Task** (a subtask's parent): priority and due date pills with the key, then "3 of 4 subtasks done" progress.
  - **Source** (a synced task's key): the item's state at the provider ("In Review in Linear") and "Synced 5m ago", then "Open in Linear" and "Copy URL" (passed in `actions`).

**Base UI:** `PreviewCard` (shadcn's HoverCard on Base UI): `Root`, `Trigger` (the pill), `Portal`, `Positioner` (`sideOffset={4}`), `Popup`. Open and close delays via `delay` / `closeDelay`. Styles key off `data-open`, `data-side`, `data-starting-style` / `data-ending-style`.
