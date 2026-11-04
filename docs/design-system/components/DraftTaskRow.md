# DraftTaskRow

A task typed into a create dialog before it is saved: a new task's subtasks, a new project's tasks. 32px, 8px in on the left and 4px on the right: the 16px status icon, the title in 14px `foreground`, then a quiet × to remove it. Hover fills it with `row-selected`.

**`DraftTaskList`** holds them: a label in 14px medium `foreground-strong` with the count in 12px `subtle-foreground` ("Subtasks 2"), the rows 4px apart, then an `Input` ("Add a subtask…") that adds the next one on Enter. The drafted tasks are created right after the task or project.
