# EntityHoverCard

The preview that opens on pointing at an entity pill (shadcn's HoverCard): 280px, on `popover` with the `edge` outline, 10px corners, `shadow-md` and 12px padding, 10px between its parts.

- **Timing:** it opens after about 400ms of pointing at the pill, so moving across a row doesn't flash cards, and sits 4px below the pill (flipping above or aligning to the pill's right edge near the window's edges). It stays while the pointer is on the pill or the card, and closes on leaving or Esc. Keyboard focus on a pill opens it too.
- **A preview, not a menu:** clicking the pill still opens the item. The card carries only what helps decide whether to open it, plus the one or two actions worth taking from where you are.
- **Data:** `entity`, a `HoverCardEntity`: core's row for the item with its `type` (`project`, `event`, `note`, `task`, `source`), each a `Pick` of the fields it shows (a project's `stats` from `projects.stats`, a task's `subtaskProgress` and `external`, a note's `preview`, `updatedAt` and `project`, an event's times, `location` and `recurrenceRule`, a source's `external`). The card words its pills, meta lines, preview and progress itself, with `useFormat()`. `actions` holds its one or two xs buttons (Join, Open in Linear, Copy URL).
- **Header:** the pill's own glyph (folder in the project's colour, the calendar's 16px `ColourBar`, file icon, status icon (the overdue flag while an overdue task is not started), provider logo) and the item's name (a source's key first: "ENG-124 · Fix the token refresh race") in 14px medium `foreground-strong`, wrapping to two lines at most and then ending in "…". No `title` tooltip: the card is already the preview, and the browser drew one over its own heading.
- **By type:**
  - **Project:** a status pill and the due date ("Due Jul 1"), then, with `stats`, a progress bar over "25%" on the left and "3 of 12 tasks done" on the right.
  - **Event:** its day and time ("Today, 10:00 – 10:30 AM"), how it repeats and the location as quiet lines with their icons, then Join (passed in `actions`) when it has a meeting link.
  - **Note:** "Edited 2h ago · project", then a two-line `subtle-foreground` preview.
  - **Task** (a subtask's parent): priority and due date pills, its subtasks done as the ring pill a task row shows (`ProgressRing` and "3/4", titled "3 of 4 subtasks done"), then the key. No progress bar: that is a project's.
  - **Source** (a synced task's key): the item's state at the provider ("In Review in Linear") and "Synced 5m ago", then "Open in Linear" and "Copy URL" (passed in `actions`).

## In rows and cards

The pills of `TaskRow` (the key, the parent, the link and the project), `NoteRow`, `BoardCard` and `NoteCard` open their cards through `PillHoverCardsProvider`, which the app puts around a workspace's pages (`PillCardsProvider` in `src/renderer/shared/components`). Without it, as in the components' own stories, the pills have none.

- **One card for them all.** The provider holds a single `PreviewCard.Root` with a handle; each pill is wrapped in `PillHoverCard`, a detached `PreviewCard.Trigger` that renders the pill itself (no element around it, so a stacking row measures its pills as before) and passes its `PillTarget` as the payload. Moving from pill to pill moves the one card.
- **What a pill gives:** a `PillTarget`, the item's `type`, `id` and the `title` its pill shows (`linkTarget(task.link)` for a link; the parent pill's target is a `task`), or for a synced task's key the `source` with the task's title and its `external`, which the row holds in full.
- **Loading:** the provider's `renderCard(target)` draws the card; the app's loads the item through the route that reads one (`projects.get` with `projects.stats`, `tasks.get`, `notes.get`, `events.get`), starting as the pointer reaches the pill or it takes focus (`onPrepare`), so the card is usually drawn when it opens 400ms later. Until then it shows `EntityHoverCardPlaceholder`: the name over two loading lines; an item that can no longer be read shows its name and "No longer available".
- **Actions** in the app's cards: an event with a meeting link offers Join; a source offers "Open in Linear" and Copy URL.

**Base UI:** `PreviewCard` (shadcn's HoverCard on Base UI): `Root`, `Trigger` (the pill), `Portal`, `Positioner` (`sideOffset={4}`), `Popup`. Open and close delays via `delay` / `closeDelay`. Styles key off `data-open`, `data-side`, `data-starting-style` / `data-ending-style`.
