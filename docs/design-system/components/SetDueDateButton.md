# SetDueDateButton

What a task without a due date offers in its date slot, on a `TaskRow` or a `BoardCard`: a quiet 24px ghost `Button` (`size="xs"`): a calendar-plus and "Due" in 12px `subtle-foreground`, like the dates beside it, brightening to `foreground` while pointed at or open; named "Set due date" for screen readers, opening the `DatePicker` in a `Popover` aligned to its end. Picking a date calls `onDueDateChange` and closes the picker.

- **Shown on intent.** The row or card hides it at rest (an undated task reads as a blank slot) and fades it in (`duration-fast`) while pointed at or focused, keeping it while the picker is open (`data-popup-open`). The hiding is the row's or card's CSS; the button itself is always drawn.
- **Where it doesn't show.** A closed task (nothing to date) and a synced one (its provider owns the date), and wherever the page gives no `onDueDateChange`.
- Elsewhere an unset due date is a "Due date" pill that opens the same picker (the sheet, the task page, the create dialog).

**Base UI:** `Popover` through DevBrain's `Popover` parts; `DatePicker`.
