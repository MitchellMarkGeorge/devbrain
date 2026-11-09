# WindowBar

Figma's `WindowBar` (a `platform` variant per platform): the 48px strip at the window's top left while the sidebar is hidden, in the sidebar's place, on `background`, 16px in at the left. In order:

- **The title bar's start** (`WindowStart`), by platform (README "Window frame"): on macOS the traffic lights' 68×12 slot (12px dots 8px apart, 52px, and 16px clear of what follows, as one slot); on Windows the menu button (`AppMenuButton`, a 28px muted `IconButton`, "Menu"), which pops up the app menu under itself, in a 44px slot that is likewise 16px clear; nothing on Linux.
- **The window controls** (`WindowControls`): the sidebar toggle (⌘\ in its tooltip, Ctrl+\ off macOS), back and forward, 28px muted `IconButton`s 8px apart. With `historyAtEnd` (the sidebar's window row) back and forward move to the row's end, the toggle staying put. Here the toggle is "Show sidebar": pointing at it peeks at the sidebar's drawer after a short delay, and clicking it pins the drawer open, or docks the sidebar where the window is wide enough (see `WorkspaceShell`).

The strip drags the window; its buttons don't. In the app the system draws the traffic lights and Windows' caption buttons and the bar only keeps their space; stories paint stand-ins (`TrafficLights drawn`, `CaptionButtons`, 3 × 46px by 48px), which `WindowFrameProvider`'s `controls: 'drawn'` turns on.

`WindowStart`, `TrafficLights`, `AppMenuButton` and `WindowControls` are exported on their own: the sidebar's 48px window row, laid out the same way so the toggle never moves, and `AppShell` use them too. `WorkspaceShell` places the bar, with the page's `PageHeader` beside it in the same row (its breadcrumb 24px after the controls, as the header's own padding), and in stories the caption buttons; pages never render it themselves.

**Base UI:** No Base UI part: plain markup with `IconButton`s.
