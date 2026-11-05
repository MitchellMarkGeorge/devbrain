# PropertyRow

The pill rows under a task or project title. They replace the side Properties card, so the page is one column and the header's star and "…" menu never open over a card.

- **First line: properties.** Each property is an `EntityPill` that opens its picker (status menu, date picker, project `Command`). Tasks: status, priority, `DateRange`, project. Projects: status, `DateRange`, a progress pill (`ProgressRing` glyph, "25% · 3 of 12 done", left out while the project has no tasks). The line ends in a muted "+ Add" pill that opens a menu of only the properties still unset (Priority, Project, Parent task, Event, Pull request); once set, a property moves into the rows.
- **Second line: links.** Links to other items, with no prefix: the `SyncedBadge` first ("Linear · ENG-124", 16px mark), then the event (its calendar's bar), the parent task (`EntityPill type="parent"`: a corner arrow, then its status icon) and the pull request. A task with no links has no second line. A synced task ends the line with a quiet note ("Synced 3 min ago", or "Edits stay in DevBrain" once detached).
- **Synced tasks** (`addable={false}`) show the provider's values as the same pills, with no "+ Add": Linear supplies those fields. A detached task gets "+ Add" back.
- Both lines wrap; pills keep the 24px `control-xs` height and size to their label.

The dates pill is `DateRange`; a task's note, under its subtasks, is `TaskNoteCard`. Each has its own guide.
