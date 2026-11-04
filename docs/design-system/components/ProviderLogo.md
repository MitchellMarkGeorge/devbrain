# ProviderLogo

The mark of the service a synced task comes from, as an icon in tight places: `SourcePill` (12px), `SyncedBadge` and `EntityHoverCard` (16px). The mark stands on its own, in one colour, filling its box less a 1px margin like the Lucide icons beside it.

- **Linear:** its logomark in `platform-linear-mark`, the neutrals Linear's brand guidelines give for monochrome use: Mercury White (#F4F5F8) in dark, Nordic Gray (#222326) in light. Linear asks for the logomark in tight layouts; its company icon (in `ProviderTile`) is for chip-sized places.
- **GitHub:** its mark in `foreground-strong`.
- **Google Calendar** is not a task source; where its mark is needed at this size, use `GoogleCalendarLogo` (exported here), its full-colour logo.
- Brand marks are drawn as their owners publish them (`ProviderLogo/marks.tsx`): never redrawn, recoloured beyond what their guidelines allow, or combined with other graphics.

**Base UI:** No Base UI part: an SVG mark.
