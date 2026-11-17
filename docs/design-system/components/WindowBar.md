# WindowBar

The title bar's start: the first `sidebar-width` (256px) of the `title-bar-height` (44px) strip across the top of a `WorkspaceShell`, on the window's `sidebar` colour, 16px in at the left. It is the same whether the sidebar is docked or hidden, and nothing in it moves. In order:

- **The title bar's start** (`WindowStart`), by platform (README "Window frame"): on macOS the traffic lights' 68×12 slot (12px dots 8px apart, 52px, and 16px clear of what follows, as one slot); on Windows the menu button (`AppMenuButton`, a 28px muted `IconButton`, "Menu"), which pops up the app menu under itself, in a 44px slot that is likewise 16px clear; nothing on Linux.
- **The workspace** (`workspace`): a `WorkspaceButton` (the tile, the name, a chevron; see `WorkspaceSwitcher`), opening the workspace menu. It is as wide as its name, and cuts a long one short with "…", so it and the toggle never pass the sidebar's width.
- **The sidebar toggle** (`WindowControls`), right after the workspace (4px), a 28px muted `IconButton` with ⌘\ in its tooltip (Ctrl+\ off macOS). It hides the docked sidebar ("Hide sidebar"); while it's hidden ("Show sidebar") pointing at it peeks at the sidebar's drawer after a short delay, and clicking it pins the drawer open, or docks the sidebar where the window is wide enough; while the drawer is open it names what it does then ("Dock sidebar", "Keep sidebar open", "Close sidebar"). See `WorkspaceShell`.

**Back and forward** (`HistoryControls`, two 28px muted `IconButton`s 4px apart) aren't in the bar: `WorkspaceShell` puts them before its search field, in the group centred on the window.

The strip drags the window; its buttons don't. In the app the system draws the traffic lights and Windows' caption buttons and the bar only keeps their space; stories paint stand-ins (`TrafficLights drawn`, `CaptionButtons`, 3 × 46px by `title-bar-height`), which `WindowFrameProvider`'s `controls: 'drawn'` turns on.

`WindowStart`, `TrafficLights`, `AppMenuButton`, `WindowControls` and `HistoryControls` are exported on their own; `AppShell` uses `WindowStart` for its title bar. `WorkspaceShell` places the bar at the start of its title bar and in stories paints the caption buttons too. Pages never render it themselves.

**Base UI:** No Base UI part: plain markup with `IconButton`s.
