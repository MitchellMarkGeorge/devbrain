# PropertyRow

The pill rows under a task or project title. They replace the side Properties card, so the page is one column and the header's star and "…" menu never open over a card.

- **First line: properties.** Each property is an `EntityPill` that opens its picker (status menu, date picker, project `Command`). Tasks: status, priority, `DateRange`, project. Projects: status, `DateRange`, a progress pill (`ProgressRing` glyph, "25% · 3 of 12 done", left out while the project has no tasks). The line ends in a muted "+ Add" pill that opens a menu of only the properties still unset (Priority, Project, Parent task, Event, Pull request); once set, a property moves into the rows.
- **Second line: links.** Links to other items, with no prefix: the Linear badge first, then the event (its calendar's bar), the parent task (`EntityPill type="parent"`: a corner arrow, then its status icon) and the pull request. A task with no links has no second line. A synced task ends the line with a quiet note ("Synced 3 min ago", or "Edits stay in DevBrain" once detached).
- **Synced tasks** (`addable={false}`) show the provider's values as the same pills, with no "+ Add": Linear supplies those fields. A detached task gets "+ Add" back.
- Both lines wrap; pills keep the 24px `control-xs` height and size to their label.

## DateRange

The dates property, one value until a start date exists: the due date and a muted "+ Start date" pill. Once a start date is set, two pills, start → due, with a `muted-foreground` arrow between them; each pill opens its own picker (the due date picker, or the start and due range picker anchored under the start pill).

## The task note card

A task's note sits under its subtasks as a flat card in one row, like a task row: the file icon, the note title (cut with "…"), then on the right pills for the note's project and a summary of the tasks linked in it, then the edit time. The summary is a plain `EntityPill` with the `circle-check` icon ("2 tasks · 1 in progress"), the same pill the note editor shows under its title. In a narrow side sheet the card stacks: the pills go on a second line under the title.
