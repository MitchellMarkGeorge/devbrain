# WorkspaceShell

The window inside a workspace, the frame every page in it shares: the `Sidebar` at the left, the page (its `PageHeader`, `PageToolbar` and `PageContent`) in the middle, and a docked sheet at the right. It measures its own width and follows the README's window sizes: Outside a workspace (onboarding, Create workspace, the splash) the window is an `AppShell`.

- **Wide and medium (1080px and up):** the sidebar rests docked; sheets dock.
- **Compact (below 1080px):** the sidebar rests hidden. Sheets float (`Sheet variant="overlay"`); read `useWorkspaceShell().size` to choose.

The sidebar is **docked or hidden**, nothing in between. `collapsed` is the user's choice (⌘\ or the sidebar toggle) and hides it at any size; a compact window hides it too. `useWorkspaceShell().sidebarHidden` says which.

- **Docked:** the sidebar in its 256px column, drawing the window row (the title bar's start, then toggle, back and forward at its right), the page's header beside it.
- **Hidden:** the column is 0 wide, and the sidebar in it stays mounted (so folded groups keep their state) but invisible and `inert`. The `WindowBar` runs across the top of the page and carries the page's header. A docked sheet runs the full height beside it, as beside the docked sidebar (on Windows the bar runs across it too, and it starts under it).
- **Hiding and docking** slide the column between 256px and 0 in `duration-slow` (`ease-surface`): the sidebar slides out to the left and back, the page widening and narrowing beside it.

While hidden, the sidebar opens as a **drawer** over the page (`shadow-2xl`, the `backdrop` scrim behind), sliding in from the window's left edge in `duration-slow` (`ease-surface`) as the scrim fades in, and back out as it closes. Nothing moves under `prefers-reduced-motion`.

- **Peek:** pointing at the toggle in the `WindowBar`, or at an 8px strip along the window's left edge under the bar, opens it after `PEEK_OPEN_DELAY` (200ms); leaving first cancels it. A peek is non-modal and leaves focus where it was, so typing carries on. It closes `PEEK_CLOSE_DELAY` (300ms) after the pointer leaves the drawer, unless the pointer comes back. Only a mouse peeks.
- **Pin:** clicking the toggle or ⌘\ pins the drawer in a compact window: modal, focus moving into it. Pressing inside a peeking drawer, or focusing into it, pins it too, so a menu it opens never closes it. Where the window is wide enough the toggle docks the sidebar instead, swapping the drawer for the docked sidebar where it stands, with no motion. `drawerOpen`/`defaultDrawerOpen` open it pinned.
- **Close:** Esc, a click on the scrim, picking a page, or the drawer's toggle once pinned. Keyboard users open it with the toggle (Enter or Space) or ⌘\.

The drawer's toggle names what it does: "Keep sidebar open" while peeking, "Close sidebar" once pinned, "Dock sidebar" where docking is possible. In the `WindowBar` it's "Show sidebar"; in the docked sidebar, "Hide sidebar".

The shell **fades in as it appears**, in `duration-slow` (`ease-surface`), growing from 99%: in the app that's after the splash, at startup and on a switch of workspace, since a page changing inside the shell doesn't mount it again. Nothing moves under `prefers-reduced-motion`.

A docked sheet's column slides open and shut with the sheet on the same timing (`duration-slow`, `ease-surface`), so the page narrows and widens smoothly and the sheet's edge is the page's edge throughout.

The page scrolls inside the shell, under its header, never the window: the scroller carries `data-slot="page-scroll"`, which the app's router scrolls to the top on a new page and restores on Back and Forward (`docs/renderer/routing.md`). `onBack`/`onForward`/`canGoBack`/`canGoForward` drive the window row's arrows; the app passes its router's history.

A docked sheet opens a `sheet-width` column: set `sheetOpen` and portal `SheetContent` into `useWorkspaceShell().sheetContainer`.

The shell follows the window frame (`WindowFrameProvider`; README "Window frame"), and sets `data-platform` for the CSS:

- **macOS and Linux:** as above. The header tops the page column; a docked sheet runs the full height.
- **Windows:** Windows draws its caption buttons over the top right. Beside the docked sidebar the header gets a row of its own (at least 48px, draggable) across the page and the sheet, which starts under it; the header's actions stop 16px short of the buttons. While the sidebar is hidden, the `WindowBar` already runs across the top. In stories (`controls: 'drawn'`) the shell paints the caption buttons.

In the app the drawer doesn't drag the window (`-webkit-app-region: no-drag`, its window row too): the `WindowBar` under it would otherwise keep dragging through it, and a drag region swallows the pointer, which would close a peek.

**Base UI:** `Dialog` for the drawer (non-modal while peeking, modal once pinned; Esc and outside click close it). Layout is a CSS grid with a container query on the shell's own width.
