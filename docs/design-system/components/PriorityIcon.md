# PriorityIcon

A task's priority (core's `TaskPriority`): `HIGH` double chevron up (`priority-high`), `MEDIUM` equals (`priority-medium`), `LOW` chevron down (`priority-low`), and `NONE` a dash in `muted-foreground`, at a 2.5 stroke. Unlabelled in rows (it still names itself to screen readers, "High priority"); inside a Badge with its word in the properties panel.

`NONE` is no priority, which only a synced task has: its provider has none set (Linear's "No priority") or none DevBrain can read. Sync is the only thing that sets it. It names itself "No priority" and stays neutral, as its group heading does. No menu offers it: see `PriorityMenu`.
