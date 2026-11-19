# WorkspaceSwitcher

The open workspace and its menu, at the start of the window's title bar (`WorkspaceShell`'s `workspace`).

- **`WorkspaceButton`:** a 20px `WorkspaceTile`, the workspace name (14px medium `foreground`, cut short with "…" when there's no room) and a 12px up-down chevron, on a 28px button with `radius-md` corners. It fills with `sidebar-accent` on hover and `accent` while its menu is open. In the title bar it takes the room the sidebar's width leaves between the window's start and the sidebar toggle. Its children are the menu.
- **`WorkspaceSwitcher`:** Figma's `WorkspaceSwitcherMenu`, the menu the button opens. A 240px `DropdownMenu`: the "Workspaces" label, each workspace with its 16px tile (the open one ticked; picking another opens it), a separator, "New workspace…" and "Open folder…", a separator, then "Show in Finder" for the open workspace (the file manager is named for the platform, `usePlatformWords`: "Show in Explorer" on Windows, "Show in File Manager" on Linux). Pass it as `WorkspaceButton`'s children.

**Base UI:** `Menu` (`RadioGroup` for the workspaces).
