# PriorityIcon

A task's priority (core's `TaskPriority`): `HIGH` double chevron up (`priority-high`), `MEDIUM` equals (`priority-medium`), `LOW` chevron down (`priority-low`), at a 2.5 stroke. Unlabelled in rows (it still names itself to screen readers, "High priority"); inside a Badge with its word in the properties panel.

`null` is no priority, for a synced task whose provider has none set (Linear's "No priority"): a neutral dash (`Minus`) in `muted-foreground`, named "No priority". Core still stores such a task as `LOW` so it sorts and groups, and marks it with `external.unprioritized`; draw it with `shownPriority(task)` rather than `task.priority`. Task rows, board cards and the task's properties do.
