# WorkspaceShell

The window inside a workspace, the frame every page in it shares: the `Sidebar` at the left, the page (its `PageHeader`, `PageToolbar` and `PageContent`) in the middle, and a docked sheet at the right. Each part renders once, in one place in the DOM, and a CSS grid places it; nothing is moved from one parent to another as the sidebar docks and hides, so the header never remounts. It measures its own width and follows the README's window sizes: Outside a workspace (onboarding, Create workspace, the splash) the window is an `AppShell`.

- **Wide and medium (1080px and up):** the sidebar rests docked; sheets dock.
- **Compact (below 1080px):** the sidebar rests hidden. Sheets float (`Sheet variant="overlay"`); read `useWorkspaceShell().size` to choose.

The sidebar is **docked or hidden**, nothing in between. `collapsed` is the user's choice (⌘\ or the sidebar toggle) and hides it at any size; a compact window hides it too. `useWorkspaceShell().sidebarHidden` says which.

The shell binds no keys of its own. ⌘\ is the app keymap's `sidebar.toggle` command (`src/renderer/keyboard`), which the workspace layout registers to run the shell's `toggleSidebar`, the same as clicking the toggle. The layout reaches it through `controlsRef` (`WorkspaceShellControls`), as it renders the shell rather than sitting inside it; the stories register it the same way. Inside the shell, `useWorkspaceShell()` gives the same toggle.

- **Docked:** the sidebar in its 256px column, drawing the window row (the title bar's start, then the toggle beside it, where the `WindowBar` has it, and back and forward at the row's right), the page's header beside it.
- **Hidden:** the sidebar isn't rendered in the page: it lives in the drawer (below). The `WindowBar` (the title bar's start, the toggle, back and forward) takes its place at the top left, and the page's header sits beside it in the same row; the page runs the full width under both.
- **Hiding and docking** swap one for the other at once, with no motion. The sidebar is rendered in one place at a time, so anything it keeps only in its own state (a scroll position) starts afresh; what should survive, such as folded groups, belongs in the app's state.

While hidden, the sidebar opens as a **drawer** over the page (`shadow-2xl`, the `backdrop` scrim behind), sliding in from the window's left edge in `duration-slow` (`ease-surface`) as the scrim fades in, and back out as it closes. Nothing moves under `prefers-reduced-motion`.

- **Peek:** pointing at the toggle in the `WindowBar`, or at an 8px strip along the window's left edge under the bar, opens it after `PEEK_OPEN_DELAY` (200ms); leaving first cancels it. Hiding the sidebar with its toggle leaves the pointer on the bar's toggle, which appears in the same place; that doesn't peek until the pointer moves away and comes back. A peek is non-modal and leaves focus where it was, so typing carries on. It closes `PEEK_CLOSE_DELAY` (300ms) after the pointer leaves the drawer, unless the pointer comes back. Only a mouse peeks.
- **Pin:** clicking the toggle or ⌘\ pins the drawer in a compact window: modal, focus moving into it. Pressing inside a peeking drawer, or focusing into it, pins it too, so a menu it opens never closes it. Where the window is wide enough the toggle docks the sidebar instead, swapping the drawer for the docked sidebar where it stands. `defaultDrawerOpen` opens it pinned (stories).
- **Close:** Esc, a click on the scrim, picking a page, the drawer's toggle once pinned, or a swipe to the left. Focus goes back to where it was. Keyboard users open it with the toggle (Enter or Space) or ⌘\.
- The drawer stays mounted while closed (hidden), so a peek opens at once.

The drawer's toggle names what it does: "Keep sidebar open" while peeking, "Close sidebar" once pinned, "Dock sidebar" where docking is possible. In the `WindowBar` it's "Show sidebar"; in the docked sidebar, "Hide sidebar".

The shell **fades in as it appears**, in `duration-slow` (`ease-surface`), growing from 99%: in the app that's after the splash, at startup and on a switch of workspace, since a page changing inside the shell doesn't mount it again. Nothing moves under `prefers-reduced-motion`.

The page sits under its header in a column, and the header never scrolls away. On a list or grid page the toolbar stays put too, and the page's `TaskList`, `Board` or `VirtualCardGrid` fills the height left under it (through `PageContent`) and scrolls itself, so the page never scrolls (the `ListPage` story). A Home or document page keeps its own height and scrolls whole inside the shell's page scroller, never the window. That scroller is a `ScrollArea` (its scrollbar drawn over the page's edge, taking no width) whose scrolling element carries `data-slot="page-scroll"`, which the app's router scrolls to the top on a new page and restores on Back and Forward (`docs/renderer/routing.md`). `onBack`/`onForward`/`canGoBack`/`canGoForward` drive the window row's arrows; the app passes its router's history.

A page docks a sheet by portalling its `SheetContent` into `useWorkspaceShell().sheetContainer`, the column at the right. The column is `sheet-width` while an open sheet is in it (`:has([data-sheet][data-open])`, which `SheetContent` marks) and 0 wide otherwise, so there is no open flag to keep in step. Its width slides with the sheet's own duration and easing: it opens as the sheet mounts and shuts as the sheet closes. To slide out, a sheet has to stay mounted while it closes: pass `open={false}` and unmount it from `onOpenChangeComplete` (the tasks page's `TaskSheet` does), rather than unmounting it at once.

The shell follows the window frame (`WindowFrameProvider`; README "Window frame"), and sets `data-platform` for the CSS:

- **macOS and Linux:** as above. The header tops the page column; a docked sheet runs the full height.
- **Windows:** Windows draws its caption buttons over the top right, so the header's row (at least 48px, draggable) runs across the sheet's column too, and a docked sheet starts under it; the header's actions stop 16px short of the buttons. In stories (`controls: 'drawn'`) the shell paints the caption buttons.

The grid has four templates, one per platform group and sidebar state:

|              | Docked                                         | Hidden                                  |
| ------------ | ---------------------------------------------- | --------------------------------------- |
| macOS, Linux | `sidebar header sheet` / `sidebar main sheet`  | `bar header sheet` / `main main sheet`  |
| Windows      | `sidebar header header` / `sidebar main sheet` | `bar header header` / `main main sheet` |

Each has a third row, `status status status`: the `statusLine` slot, a `StatusLine` across the window's bottom under the sidebar, the page and a docked sheet, which the app passes while Vim mode is on (the `VimStatusLine` story). Without one the row is empty and takes no height.

In the app the drawer doesn't drag the window (`-webkit-app-region: no-drag`, its window row too): the `WindowBar` under it would otherwise keep dragging through it, and a drag region swallows the pointer, which would close a peek.

**Base UI:** `Drawer` for the hidden sidebar (non-modal while peeking, modal once pinned, which traps focus; Esc, an outside click and a swipe close it). Layout is a CSS grid with a container query on the shell's own width.
