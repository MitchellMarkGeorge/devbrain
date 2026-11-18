# SyncStatus

The sync line at the start of the sidebar's footer row, before Trash, Settings and Help: a 16px icon and a 12px `muted-foreground` line, 8px apart, 6px/8px padding, 8px corners. It takes the room the footer's actions leave (about 150px), so each state has a short form, and a line that still doesn't fit ends in an ellipsis rather than wrapping. Clicking the line opens Integrations.

- **synced:** `circle-check` in `status-completed`, "Synced 2 min ago".
- **syncing:** `loader-circle` spinning (still under reduced motion), "Syncing…".
- **error:** `circle-alert` and "Sync failed" in `destructive`, then Retry (`sync.now`) as an xs muted icon button (`rotate-cw`, drawn at 16px to match the line's icon) right after the text, named "Retry sync" in its tooltip.
- **rate-limited:** `clock` in `date-today`, "Paused · 9:15 AM"; its tooltip says "Syncing resumes at 9:15 AM".
- **offline:** `wifi-off`, "Offline"; its tooltip says "Syncing resumes when you reconnect".
- **off:** integrations are connected but every source is turned off: `cloud-off` and "Sync off", in `subtle-foreground`; its tooltip says "Every source is turned off. Turn one on in Integrations".
- **none:** no integration is connected (none set up, or every one turned off): `plug` and "Set up sync", in `subtle-foreground`, an invitation. Its tooltip says what syncing brings ("Sync tasks and events from your tools").

Off and none are quieter than the states that report on syncing, as nothing is going wrong. Clicking either opens Integrations, as the other states do. The sidebar shows nothing until `sync.status` first answers, so a workspace that syncs never flashes either.

Tooltips open above, as the line sits at the window's bottom.

**Base UI:** No Base UI part: buttons; `role="status"` announces changes.
