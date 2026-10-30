# Badge

shadcn's Badge, drawn as DevBrain's pill: 24px tall and fully round, `background` fill with a `border` line, 12px medium text, 12px icon, 6px gap. Filled badges (`default`, `secondary`, `destructive`) are Nova's 20px.

- `variant`: `outline` is the DevBrain pill used everywhere (projects, status, dates, counts); `default`, `secondary` and `destructive` (tinted, red text) exist for the rare filled tag.
- Additions: an `icon` node (status icon, progress ring), a `prefix` in `muted-foreground` ("Due", "Linked to"), `muted` labels, and an event colour bar.
- Labels truncate at 240px; show the full name in a `Tooltip`. Unset properties are muted "+ Add …" pills, never blanks.

**Base UI:** No Base UI part: a `span`. A badge that opens something renders as the trigger (`Popover.Trigger`, `Menu.Trigger`) via `render`.
