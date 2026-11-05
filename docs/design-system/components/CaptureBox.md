# CaptureBox

Figma's `CaptureBox`: Home's box for adding a task, note or event. It holds the slot an AI prompt will take later, at the same footprint, so it spans Home's 800px column (`home-max-width`). A `card` with the `border-strong` outline and 14px corners, 12px padding (10px at the bottom), three rows 6px apart:

- **Top (34px):** the Task / Note / Event `ToggleGroup` (on the card its track is outlined and its thumb filled in `border-strong`), then at the right a `/` key (`Kbd variant="raised"`) and "for commands" in 12px `subtle-foreground`.
- **Field (52px):** free text in 14px `foreground-strong`, 8px from the top and 4px in; the placeholder follows the kind ("What needs doing?") in `subtle-foreground`.
- **Details (28px):** the kind's pickers as ghost sm buttons 2px apart (`CaptureBoxPicker`: project, due date and priority for a task; calendar, time and length for an event; the project for a note), and the primary sm "Add task" / "Add note" / "Add event" at the right.

Typing is read as you go: a recognised word ("tomorrow", "#Auth Overhaul") is marked in the field with an `accent` tint (`highlights`) and its picker fills in (the caller passes the filled `pickers`). Enter, or the button, adds the item and clears the field. While the field has keyboard focus the box takes the focus ring.

`tip`: the one-line tip 10px under the box, centred in 12px `subtle-foreground` ("Type “tomorrow” or “#Auth Overhaul” and the details fill in. Press Enter to add."; in a new workspace, "Try “Draft Q3 roadmap tomorrow”. Press Enter to add it.").

**Base UI:** `ToggleGroup` for the kind; the pickers are `Button`s that open their menus.
