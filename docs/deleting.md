# Deleting tasks, projects and notes

The UI calls archiving "moving to trash": it sets `archivedAt` and can be undone. Deleting removes
an item for good, and is only offered on the Trash page, for items already in the trash (Figma,
"v2 Screens": "Trash – row right-click menu" and "Trash — delete permanently confirm"). Menus and
detail views offer "Move to trash" and no delete. So core deletes only archived items and refuses
an active one with `NotArchivedError` (`not_archived`), the error restore already uses. The code
still says "archive"; renaming it to trash is a follow-up.

## Where it lives

`TaskService.deleteTask`, `ProjectService.deleteProject` and `NoteService.deleteNote`, exposed as
`tasks.delete`, `projects.delete` and `notes.delete`, like `EventService.deleteEvent` and
`events.delete`. They are on each entity's service rather than the archive service because each
needs what only its own service has: the task tree and its sync rules for tasks, and for notes the notes folder and the
queue of content saves the delete must wait behind.

Each delete runs in one transaction and sends a `deleted` change as its last step, inside it, so
search drops the rows in the same commit, as an archive does. The `ChangeTracker` maps it to the
deleted kind plus the kinds that lost a link to it.

## What goes, what stays

Foreign keys do the work; `runMigrations` leaves them on for the connection, and the tests check
it.

| Deleted | Removed with it                                                  | Kept, with the reference cleared                                                                                      |
| ------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Task    | Its subtasks at any depth (`parentTaskId` cascades); their links | Their task notes (`notes.linkedTaskId` set null)                                                                      |
| Project | Its external link                                                | Its tasks and notes (`projectId` set null)                                                                            |
| Note    | Its markdown file, after the commit                              | Tasks made from it, subtasks included (`linkedNoteId` set null); the task it was the task note of, which now has none |

- **Only from the trash.** A task needs its whole subtree archived. Archiving takes the subtree
  along, but sync archives a removed Linear task on its own and can leave synced subtasks live under
  it; deleting it would take those with it, so it is refused until they are gone too.
- The response lists every id removed (a task's whole subtree) and every row that lost a link.
- **Projects keep their tasks and notes.** They are the user's own work, and a project is a
  grouping. Deleting them too is a delete of each. Archived ones stay archived.
- **One task note per task** still holds: `notes.linkedTaskId` is unique, and a delete only clears
  it. A freed note can become another task's task note.
- **Deleting a task note** leaves its task as it was: the link lives on the note, so the task row
  is not written. The response's `linkedTaskId` names the task, which can then take a new task note.
- **Search, favorites and recents.** Favorites and recents are columns of the rows and go with them.
  Search entries are removed through the change.
- **A note's file** is removed after the row's transaction commits, so a failed delete never leaves
  a row without its file. If removing the file fails, the delete has still happened: the call
  resolves with `fileRemoved: false` and logs the error's class. The file stays in the notes folder,
  which nothing reads without a row. A content save already queued for the note runs first; one
  called later finds no note.
- `general.confirmBeforeDeleting` is the renderer's to check. Core never reads it.

## Synced items

| Link state                         | Delete                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| none (local)                       | Allowed                                                                              |
| `synced`                           | Never archived, so refused with `not_archived` (`external_read_only` is checked too) |
| `detached` or `removed` (any kind) | Allowed, nothing recorded for sync                                                   |

A detached task is the user's own copy of a provider item, and they own the copy, not the item. A
`removed` one is the same: the provider no longer assigns it, and what is left is the user's.
Deleting either deletes the copy and its link, and nothing else. Sync keeps no record of it, so if
the provider sends the same item again (it is still assigned and changes, it is found by reconcile,
or it is assigned again later), sync treats it as never mirrored and adds it as a new synced task.
That is the provider's state coming in, not the deleted copy coming back, and DevBrain does not try
to suppress it. The same holds for detached and removed projects.

- A synced task only has synced tasks below it, and a detached or local one none, so checking the
  whole subtree refuses exactly the synced ones.
- A project that is not synced holds no synced tasks (sync moves them out before detaching it), so
  deleting one writes no provider-owned field.

## Empty trash

`Workspace.emptyTrash`, exposed as `archive.emptyTrash`, deletes every item in the trash for good.
It is on the workspace because it crosses the three services: each has a method that deletes every
archived row of its own (`TaskService.deleteArchivedTasks`, `ProjectService.deleteArchivedProjects`,
`NoteService.deleteArchivedNotes`), and the workspace runs the three in one transaction, so either
the whole trash goes or none of it. Then it removes the deleted notes' files.

- **The same rules as one delete.** Links work as in the table above: a task takes its subtasks and
  their links, a project leaves its tasks and notes with no project, a note leaves the tasks linked
  to it. An archived task with an active or synced task anywhere below it stays in the trash, as
  `tasks.delete` refuses it; the response lists it in `keptTaskIds`.
- **Order.** Tasks go first, then projects, then notes, so the projects' and notes' changes name
  only the tasks that are left.
- **One change per service**, each sent as the last step of its own part of the transaction, so
  search drops every row in the same commit. Project and note `deleted` changes name every id they
  removed (`projectIds`, `noteIds`), as task and event deletes already did.
- **The files after the commit.** Each waits behind the content saves already queued for its note.
  A file that can't be removed does not stop the others or undo anything, as with `notes.delete`:
  its error class is logged, and its note id is listed in `filesNotRemoved`. The file stays in the
  notes folder, which nothing reads without a row.
- **The response** lists the ids removed (`taskIds`, `projectIds`, `noteIds`), `keptTaskIds` and
  `filesNotRemoved`. Rows that only lost a link are not listed; the response's `changed` names
  their kinds.
- `general.confirmBeforeDeleting` is the renderer's to check, as for one delete.
