# WorkspaceSwitcher

The open workspace and its menu, at the top of the sidebar: the sidebar's `header`, a `SidebarHeader`, pinned straight under the title bar while the rest scrolls.

- **`WorkspaceButton`:** a 20px `WorkspaceTile`, the workspace name (14px medium `foreground`, cut short with "…" when there's no room) and a 12px up-down chevron, on a 28px button with `radius-md` corners. It fills with `sidebar-accent` on hover and `accent` while its menu is open. It starts at the sidebar's 12px inset, so its tile lines up with the items' icons under it, and is as wide as its name, up to the sidebar's width. Its children are the menu.
- **`WorkspaceSwitcher`:** Figma's `WorkspaceSwitcherMenu`, the menu the button opens. A 240px `DropdownMenu`: the "Workspaces" label, each workspace with its 16px tile (the open one ticked; picking another opens it), a separator, "New workspace…" and "Open folder…", a separator, then "Show in Finder" for the open workspace. Pass it as `WorkspaceButton`'s children.

**Base UI:** `Menu` (`RadioGroup` for the workspaces).
