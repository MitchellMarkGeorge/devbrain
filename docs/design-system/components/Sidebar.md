# Sidebar

shadcn's Sidebar laid out as in Figma: 256px (shadcn's width) on the page colour, 12px side padding, 16px between groups.

- Header: a 20px `WorkspaceTile`, the workspace name (14px medium) and a chevron that opens the workspace menu; search and a 24px "new" button on the right.
- Every item, in the main navigation and in Recents and Favorites, is the same: 32px (Nova), 16px icon (or an event's colour bar), 14px `sidebar-foreground` label, 8px corners. The current page takes `sidebar-accent` with a `border-strong` outline.
- Projects in Recents and Favorites show their folder icon in the project's colour, as in their `EntityPill` (`color` on the entry); notes and tasks keep their own icons.
- Recents and Favorites each start with Nova's 32px group label: 12px medium `sidebar-foreground` at 70%; "More" overflows. Settings and Help sit at the bottom.

**Base UI:** No single Base UI part: shadcn's Sidebar layout built from plain markup, with Base UI `Menu` for the workspace switcher, `Collapsible` for collapsible groups and `ScrollArea` for the scrolling list. Active items carry `data-active`. Styles key off `data-active` on the current item.
