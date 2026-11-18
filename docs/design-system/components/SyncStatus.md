# SyncStatus

The sync line at the start of the sidebar's footer row, before Trash, Settings and Help: a 16px icon and a 12px `muted-foreground` line, 8px apart, 6px/8px padding, 8px corners. It takes the room the footer's actions leave (about 150px), so each state has a short form, and a line that still doesn't fit ends in an ellipsis rather than wrapping. Clicking the line opens Integrations.

- **synced:** `circle-check` in `status-completed`, "Synced 2 min ago".
- **syncing:** `loader-circle` spinning (still under reduced motion), "Syncing…".
- **error:** `circle-alert` and "Sync failed" in `destructive`, then Retry (`sync.now`) as an xs muted icon button (`rotate-cw`, drawn at 16px to match the line's icon) right after the text, named "Retry sync" in its tooltip.
- **rate-limited:** `clock` in `date-today`, "Paused · 9:15 AM"; its tooltip says "Syncing resumes at 9:15 AM".
- **offline:** `wifi-off`, "Offline"; its tooltip says "Syncing resumes when you reconnect".
- **none:** no source syncs (nothing connected, or every source turned off): `plug` and "Set up sync", both in `subtle-foreground`: an invitation, quieter than the states that report on syncing. Its tooltip says what syncing brings ("Sync tasks and events from your tools"), and clicking it opens Integrations as the other states do. It says "Set up sync" rather than "Connect an account" because it also shows when accounts are connected but every source is off. The sidebar shows nothing until `sync.status` first answers, so a workspace that syncs never flashes it.

Tooltips open above, as the line sits at the window's bottom.

**Base UI:** No Base UI part: buttons; `role="status"` announces changes.
