# SyncStatus

The sync line at the start of the sidebar's footer row, before Trash, Settings and Help: a 16px icon and a 12px `muted-foreground` line, 8px apart, 6px/8px padding, 8px corners. It takes the room the footer's actions leave (about 150px), so each state has a short form, and a line that still doesn't fit ends in an ellipsis rather than wrapping. Clicking the line opens Integrations.

- **synced:** `circle-check` in `status-completed`, "Synced 2 min ago".
- **syncing:** `loader-circle` spinning (still under reduced motion), "Syncing…".
- **error:** `circle-alert` and "Sync failed" in `destructive`, then Retry (`sync.now`) as an xs muted icon button (`rotate-cw`, drawn at 16px to match the line's icon) right after the text, named "Retry sync" in its tooltip.
- **rate-limited:** `clock` in `date-today`, "Paused · 9:15 AM"; its tooltip says "Syncing resumes at 9:15 AM".
- **offline:** `wifi-off`, "Offline"; its tooltip says "Syncing resumes when you reconnect".

Tooltips open above, as the line sits at the window's bottom.

**Base UI:** No Base UI part: buttons; `role="status"` announces changes.
