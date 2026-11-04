# SyncedBadge

Where a synced task or event comes from, under its title in a sheet and on the links line of its page: the provider's 16px mark, then its name and key ("Linear · ENG-124", "Google Calendar · Engineering"). Not interactive; "Open in Linear" sits below it in a sheet.

- **`synced`**: an outlined pill (24px, `border` outline, no fill, 4px in on the left and 8px on the right) with the label in 12px medium `foreground`.
- **`detached`**: quiet text, "Detached from Linear · ENG-124" in `muted-foreground` with the mark at half strength, for a local copy that still remembers its source.

Rows and board cards use the smaller `SourcePill` (the key alone) instead. `ProviderLogo` draws Linear and GitHub; pass `logo` for a provider it doesn't draw yet.
