# WorkspaceShell

The window inside a workspace, the frame every page in it shares: the **title bar** across the top, then the `Sidebar` at the left and the page and a docked sheet beside it, each in a **card**. A CSS grid places each part, and nothing is moved from one parent to another as the sidebar docks and hides, so the page never remounts. The page is the shell's `children`: a `Page`, which declares its own header (a `PageHeader`, or none) and scrolls itself (`PageHeader.md`). The shell gives the header a place in the title bar but holds nothing of the page's. It measures its own width and follows the README's window sizes. Outside a workspace (onboarding, Create workspace, the splash) the window is an `AppShell`.

- **Wide and medium (1080px and up):** the sidebar rests docked; sheets dock.
- **Compact (below 1080px):** the sidebar rests hidden. Sheets float (`Sheet variant="overlay"`); read `useWorkspaceShell().size` to choose.

```
┌──────────────────────────────────────────────────────┐
│ ●●●  ◫  ←  →    Tasks › List                    ☆  ⋯ │
├──────────┬───────────────────────────────────────────┤
│ sidebar  │ ╭───────────────────────────────┬───────╮ │
│          │ │ page (a Page)                 │ sheet │ │
│          │ │                               │       │ │
│          │ ╰───────────────────────────────┴───────╯ │
└──────────┴───────────────────────────────────────────┘
```

## The title bar

The `WindowBar` (`title-bar-height`, 40px) runs across the whole window, whether the sidebar is docked or hidden: the title bar's start (the traffic lights on macOS, the menu button on Windows, nothing on Linux), then the sidebar toggle, back and forward. It is always there and its controls never move, so the toggle is in the same place to hide the sidebar and to show it again. It drags the window; its buttons don't.

After the controls, the title bar holds **the page's header**: a `Page` portals its `header` into the bar's slot (`useWorkspaceShell().titleBarContainer`, as a docked sheet goes into `sheetContainer`). The header is still the page's own JSX, so its menus and buttons use the page's state. The slot starts at the card's left edge while the sidebar is docked, so the header's crumbs (24px in) line up with the page under them, and right after the controls while it's hidden: the controls take at least the sidebar column's width (`min-width: var(--workspace-sidebar-column)`), and the slot follows them. As the sidebar slides, the header moves with the card's edge until it reaches the controls. In the slot, buttons, links and other controls don't drag the window; the rest of the bar does. On Windows the slot stops short of the caption buttons (`--title-bar-end`). Only one page's header shows at a time: a page kept mounted under the next one's loading keeps its header out of the way (the slot shows its last child).

## Docked and hidden

The sidebar is **docked or hidden**. `collapsed` is the user's choice (⌘\ or the sidebar toggle) and hides it at any size; a compact window hides it too. `useWorkspaceShell().sidebarHidden` says which.

- **Docked:** the sidebar in its `sidebar-width` (256px) column under the title bar, the card beside it.
- **Hidden:** the column is 0 wide and the card spans the window under the title bar. The sidebar opens as a drawer over the page (below).
- **Hiding and docking slide.** The column's width (`--workspace-sidebar-column`, a registered property the shell transitions) slides between the two in `duration-slow` (`ease-surface`), the sidebar sliding out (or in) with it so its right edge stays on the column's, and the card's left edge follows. Nothing moves under `prefers-reduced-motion`. While it slides shut the sidebar is `inert`; once shut it is unmounted and the drawer, which renders the sidebar again, takes over (so only during that slide are there two). Anything the sidebar keeps only in its own state (a scroll position) starts afresh; what should survive, such as folded groups, belongs in the app's state.
- **Docking from the open drawer** doesn't slide: the sidebar is already showing where it docks, so the column opens at once under it (`data-instant` on the shell for that change).

The shell binds no keys of its own. ⌘\ is the app keymap's `sidebar.toggle` command (`src/renderer/keyboard`), which the workspace layout registers to run the shell's `toggleSidebar`, the same as clicking the toggle. The layout reaches it through `controlsRef` (`WorkspaceShellControls`), as it renders the shell rather than sitting inside it; the stories register it the same way. Inside the shell, `useWorkspaceShell()` gives the same toggle.

## The drawer

While hidden, the sidebar opens as a **drawer** over the page, under the title bar, drawn as a sheet, as a floating `Sheet` is: `popover`, the `edge` outline and `radius-xl` corners on the page's side (flush with the window's edge), `shadow-2xl`, and the `backdrop` scrim behind once pinned. So it reads as a layer above the page in both themes, not the docked sidebar laid over it. It runs the full height under the title bar, sliding in from the window's left edge in `duration-slow` (`ease-surface`) and back out as it closes. The title bar stays in view above it, so the toggle is always in reach. Nothing moves under `prefers-reduced-motion`.

- **Peek:** pointing at the title bar's toggle, or at an 8px strip along the window's left edge under the title bar, opens it after `PEEK_OPEN_DELAY` (200ms); leaving first cancels it. Hiding the sidebar with the toggle leaves the pointer on it; that doesn't peek until the pointer moves away and comes back. A peek is non-modal and leaves focus where it was, so typing carries on. It closes `PEEK_CLOSE_DELAY` (300ms) after the pointer leaves the drawer, unless the pointer comes back. Only a mouse peeks.
- **Pin:** clicking the toggle or ⌘\ pins the drawer in a compact window: modal, focus moving into it, the scrim over the whole window. Pressing inside a peeking drawer, or focusing into it, pins it too, so a menu it opens never closes it. Where the window is wide enough the toggle docks the sidebar instead. Pressing the toggle while the drawer peeks is the toggle's to handle, not a press outside the drawer that closes it. `defaultDrawerOpen` opens it pinned (stories).
- **Close:** Esc, a click on the scrim, picking a page, or a swipe to the left. Focus goes back to where it was. Keyboard users open it with the toggle (Enter or Space) or ⌘\.
- The drawer stays mounted while closed (hidden), so a peek opens at once.

The toggle names what it does: "Hide sidebar" while docked, "Show sidebar" while hidden; while the drawer is open, "Dock sidebar" where docking is possible, and in a compact window "Keep sidebar open" while peeking and "Close sidebar" once pinned.

The drawer floats over the page, so it doesn't drag the window (`-webkit-app-region: no-drag`): a drag region also swallows the pointer, which would close a peek.

## The card

The page sits in a card on `background`, with a `border` hairline and `radius-lg` corners, inset 8px from the window's right and bottom edges (and from its left while the sidebar is hidden). A docked sheet is a second card beside it, 8px away (`Sheet` draws it the same way). The window behind, the title bar and the sidebar are on `sidebar`, so they read as one frame around the cards. While a sheet is docked, the page's header in the title bar ends over the page's card, so its star and menu sit over the page they act on, not over the sheet.

The page fills the card, its header up in the title bar; on a list or grid page the toolbar stays put too, and the page's `TaskList`, `Board` or `VirtualCardGrid` fills the height left under it (through `PageContent`) and scrolls itself, so the page never scrolls (the `ListPage` story). A Home or document page keeps its own height and scrolls whole inside the `Page`'s scroller, never the window (`data-slot="page-scroll"`, which the app's router scrolls to the top on a new page and restores on Back and Forward; `docs/renderer/routing.md`). `onBack`/`onForward`/`canGoBack`/`canGoForward` drive the title bar's arrows; the app passes its router's history.

A page docks a sheet by portalling its `SheetContent` into `useWorkspaceShell().sheetContainer`, the column at the page's card's right. The column is `sheet-width` and the 8px gap while an open sheet is in it (`:has([data-sheet][data-open])`, which `SheetContent` marks) and 0 wide otherwise, so there is no open flag to keep in step. Its width slides with the sheet's own duration and easing: it opens as the sheet mounts and shuts as the sheet closes. To slide out, a sheet has to stay mounted while it closes: pass `open={false}` and unmount it from `onOpenChangeComplete` (the tasks page's `TaskSheet` does), rather than unmounting it at once.

The shell **fades in as it appears**, in `duration-slow` (`ease-surface`), growing from 99%: in the app that's after the splash, at startup and on a switch of workspace, since a page changing inside the shell doesn't mount it again. Nothing moves under `prefers-reduced-motion`.

## Platforms

The shell follows the window frame (`WindowFrameProvider`; README "Window frame"), and sets `data-platform`:

- **macOS:** the system's traffic lights sit at the title bar's start, which keeps their room.
- **Windows:** the menu button at the title bar's start; Windows draws its caption buttons over the title bar's right end, where the bar has nothing. In stories (`controls: 'drawn'`) the shell paints the caption buttons.
- **Linux:** the system draws its own title bar above the window, so the shell's is a row of the toggle, back and forward under it.

The grid is the same on every platform: two rows, `title-bar-height` and the rest, and two columns, the sidebar's and the card's (`bar bar` / `sidebar body`).

**Base UI:** `Drawer` for the hidden sidebar (non-modal while peeking, modal once pinned, which traps focus; Esc, an outside click and a swipe close it). Layout is a CSS grid with a container query on the shell's own width.
