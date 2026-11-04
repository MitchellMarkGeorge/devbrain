# DetailRow

A sheet's property row (Figma: DetailRow, ReadOnlyRow; PropertyField and DateField as the vertical form). Rows sit in `DetailRows`, 4px apart.

- **`DetailRow`**: an 88px label in 14px `muted-foreground`, 12px gap, then the value as pills (`EntityPill`, `DateRange`) that open their pickers. At least 28px tall; several pills wrap 6px apart. An unset value is a muted "+ Add …" pill, never a blank.
- **`ReadOnlyRow`**: a synced item's property: the provider's own value ("In Review", "Urgent") as 14px `foreground` text after its 14px glyph (status and priority icons keep their colours; Lucide glyphs are `muted-foreground` unless given a colour), nudged 2px in to line up with a pill's glyph. No pill, no hover, nothing to click. Follow the rows with the sync hint ("Synced from Linear 3 min ago · Edit in Linear", 12px `subtle-foreground`) and the "Open in Linear" / "Detach…" buttons. Links the user made locally (the event) stay `DetailRow`s.
- **`orientation="vertical"`**: a 12px label over the value, 8px apart, for a card of properties (Figma's PropertyField and DateField; the dates are a `DateRange`).

**Base UI:** No Base UI part: a `div` with `role="group"` named by its label.
