# SyncStatus

Figma's `SyncStatus`: the sync line at the top of the sidebar's footer, a 16px icon and a 12px `muted-foreground` line, 8px apart, 6px/8px padding, 8px corners. Clicking the line opens Integrations.

- **synced:** `circle-check` in `status-completed`, "Synced 2 min ago".
- **syncing:** `loader-circle` spinning (still under reduced motion), "Syncing…".
- **error:** `circle-alert` and "Sync failed" in `destructive`, then "·" and an xs ghost "Retry" (`sync.now`).
- **rate-limited:** `clock` in `date-today`, "Paused until 9:15 AM".
- **offline:** `wifi-off`, "Offline · syncing resumes when you reconnect" (wraps).

In the rail it is the icon alone, 40×32, with the line in a tooltip.

**Base UI:** No Base UI part: buttons; `role="status"` announces changes.
