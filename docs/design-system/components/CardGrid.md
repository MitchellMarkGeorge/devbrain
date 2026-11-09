# CardGrid

Cards in equal columns: the Notes and Projects card views (16px apart, `gap="md"`; `gap="sm"` is 12px). Three columns by default; in compact windows (inside a `WorkspaceShell`) two (README "Window sizes"). Home's row of small note cards is `HomeCards` (see `HomeSection`).

It draws the cards it is given, all of them: a loading state, a handful of cards. For a whole workspace's notes or projects, use `VirtualCardGrid`, which draws only the rows in view.

**Base UI:** No Base UI part: a CSS grid.
