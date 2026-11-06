# TrashRow

A deleted project, task or note in Trash, on the shared 48px `ListRow`. Its glyph (a project's coloured folder, a task's status icon, a note's file icon), the title, a synced task's key straight after it (`titlePills`), a note's excerpt a step smaller (12px) than in the Notes list, its pills (a project's status, a task's project) and when it was trashed ("Trashed 3 days ago", from `formatRelative`, 88px). Pointing at the row (or focusing it) shows an outline "Restore" and a destructive "Delete" (both xs) after the time. Ask before deleting for good.

`item`: core's `ArchivedEntity` (`entityType`, `title`, `archivedAt`, from `archive.list`) with what the page read of the item itself: a task's `status: TaskStatus` (not started without one), a project's `color` (through `resolveColor`), a note's `preview`. Pills go in `children`; plus `onRestore`, `onDelete`. Under the list, a 12px `subtle-foreground` footnote: "Items in the trash are kept until you delete them."
