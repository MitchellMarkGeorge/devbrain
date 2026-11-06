# BoardCard

A task on the board, carrying the same pills as its task row so a task reads the same in both views. It takes core's `TaskListItem` as it is (`task`, typed `BoardCardData`: a `Pick` of the fields it draws) and derives the rest:

- **Title** first, 14px `foreground-strong`, wrapping.
- **Pills** under it, 4px apart, wrapping onto further lines: the synced task's `SourcePill`, the subtask count (`ProgressRing`, as in rows), the task's `link` (an event, as an `EntityPill` with its calendar's bar, or a note), then the project (its folder in the project's colour). All 24px. A name too long for the card ellipsises inside it. A task with no links has no pill line.
- **Meta line** last: `PriorityIcon` on the left, the due date on the right, worded by `useFormat()`'s `formatDue` ("Today", "Tomorrow", "In 3 days" within a week, else "Jul 1") and coloured by `dueTone` from the status, the date and `now`: `date-today` for an open task due today, `date-overdue` for an overdue one. A completed task (`TaskStatus.COMPLETED`) drops the priority, and the line, when it has no date.
- **Card:** borderless and filled (`card`; `neutral-100` in light, where a borderless card needs a step more to show on white), 12px padding, 8px between its lines, 10px corners. On hover it fills with `accent` (`neutral-800` in dark, Figma's `card-fill-hover`), with no outline: the fill alone shows it. Keyboard focus takes Nova's ring. Completed cards go darker with a dimmed title.
- **Clicks:** a pill opens what it links to; a click anywhere else opens the task (`onClick` doesn't fire for clicks on the pills).
