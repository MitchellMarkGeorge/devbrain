# TrashRow

A deleted project, task or note in Trash, on the shared 48px `ListRow`. Its glyph (a project's coloured folder, a task's status icon, a note's file icon), the title, a synced task's key straight after it (`titlePills`), a note's excerpt a step smaller (12px) than in the Notes list, its pills (a project's status, a task's project) and when it was trashed ("Trashed 3d ago", 88px). Pointing at the row (or focusing it) shows an outline "Restore" and a destructive "Delete" (both xs) after the time. Ask before deleting for good.

`item`: `{ kind: 'project' | 'task' | 'note', title, excerpt?, status?, color?, trashed }`, plus `onRestore`, `onDelete`. Under the list, a 12px `subtle-foreground` footnote: "Items in the trash are kept until you delete them."
