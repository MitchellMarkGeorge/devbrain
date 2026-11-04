# WorkspaceSwitcher

Figma's `WorkspaceSwitcherMenu`: the menu the sidebar's workspace row opens (the row shows pressed in `accent` while it is open). A 240px `DropdownMenu`: the "Workspaces" label, each workspace with its 16px tile (the open one ticked; picking another opens it), a separator, "New workspace…" and "Open folder…", a separator, then "Show in Finder" for the open workspace. Pass it as `SidebarWorkspace`'s children.

**Base UI:** `Menu` (`RadioGroup` for the workspaces).
