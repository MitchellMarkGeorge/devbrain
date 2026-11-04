# QuickCapture

Figma's `QuickCapture`: Home's one field for creating a task, note or event. A 56px `card` with the `edge` outline and 14px corners, 16px in at the left and 8px at the right, 12px gaps: the 20×24 logomark, the field (14px, placeholder "Capture a task, note or event…"), a `/` key on `border-strong` and "for commands" in 12px `subtle-foreground`, then the Task / Note / Event `ToggleGroup` (its track outlined and its thumb filled in `border-strong`, as on a card). Enter creates the item and clears the field. Home shows the `UpNextStrip` in its place while a meeting is coming up. (Figma's description says the outline is `border-strong`; its fill and stroke values are `card` and `edge`, which this follows.)

**Base UI:** `ToggleGroup` for the kind switch.
