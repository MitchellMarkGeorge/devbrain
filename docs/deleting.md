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

| Deleted | Removed with it                                                  | Kept, with the reference cleared                                |
| ------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Task    | Its subtasks at any depth (`parentTaskId` cascades); their links | Their task notes (`notes.linkedTaskId` set null)                |
| Project | Its external link                                                | Its tasks and notes (`projectId` set null)                      |
| Note    | Its markdown file, after the commit                              | Tasks made from it, subtasks included (`linkedNoteId` set null) |

- **Only from the trash.** A task needs its whole subtree archived. Archiving takes the subtree
  along, but sync archives a removed Linear task on its own and can leave synced subtasks live under
  it; deleting it would take those with it, so it is refused until they are gone too.
- The response lists every id removed (a task's whole subtree) and every row that lost a link.
- **Projects keep their tasks and notes.** They are the user's own work, and a project is a
  grouping. Deleting them too is a delete of each. Archived ones stay archived.
- **One task note per task** still holds: `notes.linkedTaskId` is unique, and a delete only clears
  it. A freed note can become another task's task note.
- **Search, favorites and recents.** Favorites and recents are columns of the rows and go with them.
  Search entries are removed through the change.
- **A note's file** is removed after the row's transaction commits, so a failed delete never leaves
  a row without its file. If removing the file fails, the delete has still happened: the call
  resolves with `fileRemoved: false` and logs the error's class. The file stays in the notes folder,
  which nothing reads without a row. A content save already queued for the note runs first; one
  called later finds no note.
- `general.confirmBeforeDeleting` is the renderer's to check. Core never reads it.

## Synced items

| Link state                     | Delete                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| none (local)                   | Allowed                                                                              |
| `synced`                       | Never archived, so refused with `not_archived` (`external_read_only` is checked too) |
| `detached` task                | Allowed, and recorded in `deleted_external_tasks` so sync does not mirror it again   |
| `removed` (archived by sync)   | Allowed, nothing recorded                                                            |
| `detached` / `removed` project | Allowed, nothing recorded                                                            |

Deleting a row deletes its link, so with nothing else sync would see the item as never mirrored and
insert it again the next time the provider reports it. That is right for a `removed` item: it left
the user's assignments, and if it comes back it would have been restored anyway. For a detached
task it would break detach's promise that sync leaves the task alone, so the delete records the
task (and its detached subtree) by provider and external id. `SyncWriter.upsertTasks` skips a
recorded item that has no link, and reconcile does not look it up as returning.

- The record is keyed by provider and external id, not by source, like the detached copies a
  disconnect leaves, which a reconnect matches by provider and id. A deleted task stays deleted
  across a reconnect too, and a detached copy left by a disconnect can be deleted the same way.
- It lasts while the item stays assigned. When the provider reports it gone or reassigned
  (`PageWrite.removeTasks`), the record goes, and an item assigned again later comes back as a new
  task.
- A synced task only has synced tasks below it, and a detached or local one none, so checking the
  whole subtree refuses exactly the synced ones.
- Projects get no record: one is mirrored only to hold the user's synced tasks, so if Linear brings
  it back it is needed again and comes back as a new project. A project that is not synced holds no
  synced tasks, so deleting one writes no provider-owned field.

## Not done

"Empty trash" (delete every archived item) is left out. It would cross three services, including
the notes' files, and the archive view can delete items one by one meanwhile.
