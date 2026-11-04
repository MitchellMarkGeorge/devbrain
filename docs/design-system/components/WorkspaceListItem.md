# WorkspaceListItem

Figma's `WorkspaceListItem`: a recent workspace on the Welcome screen. A 52px button with 10px corners and 10px side padding, 12px gaps: the workspace's 32px tile (8px corners, a 14px letter), the name (14px `foreground-strong`) over a 12px `muted-foreground` line ("Last opened 2 days ago", or the folder path), and a 12px `subtle-foreground` note at the right ("Created Mar 2026"). Hover and keyboard focus fill it with `row-selected` and show a 16px arrow (Figma's description says "accent fill"; its fill is `row-selected`, which this follows).

`WorkspaceList` is the card around them: `card` with the `edge` outline, 14px corners, 6px padding, a 12px medium "Recent workspaces" label, items 2px apart.

**Base UI:** No Base UI part: buttons.
