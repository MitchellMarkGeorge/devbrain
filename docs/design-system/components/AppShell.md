# AppShell

The frame every screen shares: the `Sidebar` at the left, the page (its `PageHeader`, `PageToolbar` and `PageContent`) in the middle, and Home's right column or a docked sheet at the right. It measures its own width and follows the README's window sizes:

- **Wide (1280px and up):** everything shows. The right column (`aside`, 288px with a `sidebar-border` hairline, 28px/20px padding) is Home's mini calendar and agenda.
- **Medium (1080–1279px):** the right column hides; the sidebar rests open; sheets dock.
- **Compact (below 1080px):** the sidebar rests as the 56px rail. Its toggle opens the full sidebar as a drawer over the page (`shadow-2xl`, the `backdrop` scrim behind); picking a page, clicking the scrim or Esc closes it. Sheets float (`Sheet variant="overlay"`); read `useAppShell().size` to choose.
- **Collapsed:** the user's choice (⌘\ or the window bar's toggle) at any size. The rail sits under the `WindowBar`, which runs across the window and carries the page's header.

The full sidebar draws the window row itself (traffic lights, then toggle, back and forward at its right). A docked sheet opens a `sheet-width` column: set `sheetOpen` and portal `SheetContent` into `useAppShell().sheetContainer`. `trafficLights` is `reserved` in the app (macOS draws its own in Electron's `hiddenInset` title bar), `drawn` in stories, `none` on Windows and Linux.

**Base UI:** `Dialog` for the compact drawer (modal, Esc and outside click close it). Layout is a CSS grid with a container query on the shell's own width.
