# WindowBar

Figma's `WindowBar` (a `platform` variant per platform): the title bar: a `title-bar-height` (48px) strip across the top of the window in a `WorkspaceShell`, whether the sidebar is docked or hidden, on the window's `sidebar` colour, 16px in at the left. Its controls never move. In order:

- **The title bar's start** (`WindowStart`), by platform (README "Window frame"): on macOS the traffic lights' 68×12 slot (12px dots 8px apart, 52px, and 16px clear of what follows, as one slot); on Windows the menu button (`AppMenuButton`, a 28px muted `IconButton`, "Menu"), which pops up the app menu under itself, in a 44px slot that is likewise 16px clear; nothing on Linux.
- **The window controls** (`WindowControls`): the sidebar toggle (⌘\ in its tooltip, Ctrl+\ off macOS), back and forward, 28px muted `IconButton`s 8px apart. The toggle hides the docked sidebar ("Hide sidebar"); while it's hidden ("Show sidebar") pointing at it peeks at the sidebar's drawer after a short delay, and clicking it pins the drawer open, or docks the sidebar where the window is wide enough; while the drawer is open it names what it does then ("Dock sidebar", "Keep sidebar open", "Close sidebar"). See `WorkspaceShell`.

The strip drags the window; its buttons don't. In the app the system draws the traffic lights and Windows' caption buttons and the bar only keeps their space; stories paint stand-ins (`TrafficLights drawn`, `CaptionButtons`, 3 × 46px by `title-bar-height`), which `WindowFrameProvider`'s `controls: 'drawn'` turns on.

`WindowStart`, `TrafficLights`, `AppMenuButton` and `WindowControls` are exported on their own; `AppShell` uses `WindowStart` for its title bar. `WorkspaceShell` places the bar at the start of its title bar, across the window (at least the sidebar column's width, so the page's header after it starts at the card's edge while the sidebar is docked), and in stories paints the caption buttons too. Pages never render it themselves.

**Base UI:** No Base UI part: plain markup with `IconButton`s.
