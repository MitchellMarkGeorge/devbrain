# Breadcrumb

> **Not used by the app's pages since Nov 2026:** the title bar's search field says where you are (`Page`'s `title`; see `WorkspaceShell`). The component stays for the Figma screens' stories and anything that needs a trail outside the title bar.

shadcn's Breadcrumb as in the Figma top bar: the section in 14px `muted-foreground` (lifting to `foreground` on hover), a 14px chevron in `muted-foreground`, then the current item in `foreground` with its 16px entity icon (the task's status icon, a note's file, a project's folder, the list view's icon). Everything is 6px apart. When space runs out the middle items shorten first; the first and last keep their names.

**Base UI:** No Base UI part: a `nav` with an ordered list; links are plain anchors.
