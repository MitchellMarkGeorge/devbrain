# AppShell

The frame every screen shares: the `Sidebar` at the left, the page (its `PageHeader`, `PageToolbar` and `PageContent`) in the middle, and Home's right column or a docked sheet at the right. It measures its own width and follows the README's window sizes:

- **Wide (1280px and up):** everything shows. The right column (`aside`, 288px with a `sidebar-border` hairline, 28px/20px padding) is Home's mini calendar and agenda.
- **Medium (1080–1279px):** the right column hides; the sidebar rests open; sheets dock.
- **Compact (below 1080px):** the sidebar rests as the 56px rail. Its toggle opens the full sidebar as a drawer over the page (`shadow-2xl`, the `backdrop` scrim behind); picking a page, clicking the scrim or Esc closes it. The drawer opens as the rail widening: it is revealed from the rail's edge out to 256px in `duration-slow` (`ease-surface`) while its content and the scrim fade in, the same motion as collapsing the sidebar in a wider window, and closes back into the rail; nothing moves under `prefers-reduced-motion`. Sheets float (`Sheet variant="overlay"`); read `useAppShell().size` to choose.
- **Collapsed:** the user's choice (⌘\ or the window bar's toggle) at any size. The rail sits under the `WindowBar`, which runs across the sidebar and the page and carries the page's header; both are on the page colour with no hairlines, framing the page. A docked sheet and the right column run the full height beside it, as beside the full sidebar (on Windows the bar runs across them too, and they start under it).

A docked sheet's column slides open and shut with the sheet on the same timing (`duration-slow`, `ease-surface`), so the page narrows and widens smoothly and the sheet's edge is the page's edge throughout.

The full sidebar draws the window row itself (the title bar's start, then toggle, back and forward at its right). A docked sheet opens a `sheet-width` column: set `sheetOpen` and portal `SheetContent` into `useAppShell().sheetContainer`.

The shell follows the window frame (`WindowFrameProvider`; README "Window frame"), and sets `data-platform` for the CSS:

- **macOS and Linux:** as above. The header tops the page column; a docked sheet and the right column run the full height.
- **Windows:** Windows draws its caption buttons over the top right. Beside the full sidebar the header gets a row of its own (at least 48px, draggable) across the page, the right column and the sheet, which start under it; the header's actions stop 16px short of the buttons. Collapsed, the `WindowBar` already runs across the top. In stories (`controls: 'drawn'`) the shell paints the caption buttons.

**Base UI:** `Dialog` for the compact drawer (modal, Esc and outside click close it). Layout is a CSS grid with a container query on the shell's own width.
