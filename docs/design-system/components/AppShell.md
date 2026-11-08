# AppShell

The window outside a workspace (Figma "Splash", "Welcome", "Create workspace" and the Welcome error states; also the window's error pages): no sidebar, the title bar's start in a 48px draggable strip (the traffic lights on macOS; the menu button on Windows, whose caption buttons sit at the strip's right; no strip on Linux, under the system's title bar, unless there is a way back to put in it), and one centred column at most 480px wide: the mark (`Logomark`, 40×48; 60×72 pulsing on the splash; a `WorkspaceTile` on Create workspace), the title (30px semibold `foreground-strong`, 38px under the mark) and a 14px `muted-foreground` line, then the content 32px below (a `WorkspaceList`, the Create / Open buttons, the Create workspace form). An optional footer link sits at the window's foot ("What's a workspace?").

`nav` is the way back, in the strip 8px after the window's own controls: a small ghost `Button` with a `ChevronLeft`, naming where it goes ("Back to Work", or "Back"). Create workspace uses it; it doesn't drag the window.

Inside a workspace the window is a `WorkspaceShell` instead (the sidebar, the page's header, sheets).

**Base UI:** No Base UI part: plain markup.
