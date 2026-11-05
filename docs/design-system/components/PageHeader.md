# PageHeader

The top of every page, one component for lists, cards, the calendar, Settings and detail pages:

- **`PageHeader`:** a 48px bar, 24px in from the sides (on Windows its right end stops 16px short of the caption buttons instead, as it reaches the window's top right there): the page's place at the left (a `Breadcrumb`: "Tasks › List", "Projects › Auth Overhaul › Implement OAuth2 PKCE flow") and its actions at the right, 8px apart. Detail pages put the star (`PageFavoriteButton`, filled in `date-today` while on) and the "…" menu (`PageMenuButton`, aligned to the right edge) there. It spans the page even where the content is a capped column. While the sidebar is hidden, `AppShell` moves it into the `WindowBar`.
- **`PageToolbar`:** the row under it: `start` (Filter) and `end` (Sort, the view switch, the quiet "New …" button), 32px controls 8px apart, 12px above the content. Toolbar buttons show their value after the label; in compact windows pass `hideValue`.
- **`PageContent`:** the page under them. `list` keeps rows 16px from the sides, `grid` cards 24px, `home` Home's 800px column (`home-max-width`), centred across the page and, while it fits, down it, and `document` centres a 720px column (`content-max-width`) 48px under the header: notes, tasks, Settings and Integrations.

**Base UI:** `Menu` for the "…" menu; the rest is plain markup.
