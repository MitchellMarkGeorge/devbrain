# Import and export

How DevBrain moves tasks and notes in and out of a workspace, as on the "Settings (data & storage)"
screen: import tasks from CSV or JSON, import notes from Markdown, export tasks as CSV or JSON,
export notes as a folder of Markdown files. The "Import Tasks" button on the empty home screen is
the same task import.

| Piece                                                                  | Where                               |
| ---------------------------------------------------------------------- | ----------------------------------- |
| `TransferService` (`workspace.transfer`): reads, checks and writes     | `src/main/core/transfer/service.ts` |
| The formats: parse and write CSV, JSON and Markdown                    | `task-format.ts`, `note-format.ts`  |
| The import rules for task rows                                         | `task-import.ts`                    |
| Limits                                                                 | `limits.ts`                         |
| Reading untrusted files, safe file names                               | `files.ts`                          |
| IPC routes: the dialogs, then core                                     | `src/main/ipc/routers/transfer.ts`  |
| The dialogs and the file manager, over Electron's `dialog` and `shell` | `src/main/runtime/desktop.ts`       |

Core never opens a dialog and never imports Electron. A route asks the user for a file or folder
through `ctx.desktop` (the `Desktop` in `src/main/ipc/desktop.ts`), then passes the path it got to
`TransferService`. The renderer never names a path: every route takes no input but the export
format. Each route resolves with `null` when the user cancels the dialog.

## Routes

| Route                     | Dialog                                 | Returns                                        |
| ------------------------- | -------------------------------------- | ---------------------------------------------- |
| `transfer.importTasks`    | open one `.csv` or `.json` file        | `TaskImportSummary`, or `null`                 |
| `transfer.importNotes`    | open `.md`, `.markdown`, `.txt` files  | `NoteImportSummary`, or `null`                 |
| `transfer.exportTasks`    | save as, `{ format: 'csv' \| 'json' }` | `TaskExportResult` (`path`, `count`)           |
| `transfer.exportNotes`    | choose a folder                        | `NoteExportResult` (`path`, `count`, `errors`) |
| `settings.showDataFolder` | none                                   | opens the data folder in the file manager      |
| `workspace.showInFolder`  | none                                   | opens the open workspace's folder              |

"Show in Finder" opens the folder itself (`shell.openPath`), so the user sees its contents
(`settings.json`, `workspaces/`; or a workspace's `db.sqlite` and `notes/`). The data folder is the
folder DevBrain opened (`DevBrain.path`), not the `devBrainPath` setting: the renderer can write the
setting, so it is input, and main opens nothing it is handed.

If the workspace is closed or switched while a dialog is open (from another window), the route
fails with `workspace_closed` and writes nothing.

## Tasks

### JSON

What an export writes, and the fullest import:

```json
{
  "format": "devbrain.tasks",
  "version": 1,
  "exportedAt": "2026-10-31T19:30:00.000Z",
  "tasks": [
    {
      "id": "tsk_0193…",
      "title": "Launch v2",
      "description": "Markdown, or null",
      "status": "in_progress",
      "priority": "high",
      "startDate": "2026-11-01",
      "dueDate": "2026-11-05",
      "project": "Website",
      "pullRequestUrl": "https://github.com/acme/site/pull/12",
      "source": "local",
      "externalKey": null,
      "externalUrl": null,
      "completedAt": null,
      "createdAt": "2026-10-20T14:02:11.000Z",
      "subtasks": [{ "title": "Write copy", "subtasks": [] }]
    }
  ]
}
```

- An import also takes a bare array of tasks. Every key but `title` is optional; unknown keys are
  ignored. `format`, when present, must be `devbrain.tasks`, and a `version` above 1 is refused.
- `subtasks` nests at any depth (up to 32 levels).
- A value meant as text may be a number or boolean (read as text); an object or array there is an
  error for that task.
- Row numbers in the summary count tasks in document order from 1, each subtask right after its
  parent.

### CSV

One row per task, with a header. The columns an export writes, in order:

| Column             | Meaning                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `id`               | the task's id in DevBrain; in an import, only a reference (see below)    |
| `parent_id`        | the `id` of the row this one is a subtask of; empty for a top-level task |
| `title`            | required                                                                 |
| `description`      | Markdown; line breaks are kept inside a quoted cell                      |
| `status`           | `not_started`, `in_progress`, `completed`, `cancelled`                   |
| `priority`         | `low`, `medium`, `high`                                                  |
| `start_date`       | `YYYY-MM-DD`                                                             |
| `due_date`         | `YYYY-MM-DD`                                                             |
| `project`          | the project's title                                                      |
| `pull_request_url` | an http or https URL                                                     |
| `source`           | `local`, or the provider of a synced task (`linear`)                     |
| `external_key`     | a synced task's key at its provider, such as `ENG-124`                   |
| `external_url`     | a synced task's page at its provider (export only)                       |
| `completed_at`     | ISO time (export only)                                                   |
| `created_at`       | ISO time (export only)                                                   |

- RFC 4180: comma-separated, UTF-8 (an export starts with a byte order mark so spreadsheets read
  it as UTF-8), CRLF line endings; LF and CR are read too.
- Only `title` is required. Headers match ignoring case, spaces and underscores (`Due Date`,
  `due_date` and `dueDate` are the same column). Unknown columns are ignored, so a spreadsheet with
  extra columns imports.
- Blank rows are skipped. Row numbers are the spreadsheet's: the header is row 1.
- **Formula cells.** A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return would
  run as a formula in a spreadsheet, so an export puts a `'` in front of it (and of a cell that
  starts with `'`), as spreadsheets do. An import takes one `'` off such a cell, so the value comes
  back as it was.

### Import rules

| Case                                                            | What happens                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No due date                                                     | the `tasks.defaultDueDate` setting (today, tomorrow, a week from today); a subtask takes its parent's |
| No priority                                                     | the `tasks.defaultPriority` setting                                                                   |
| No status                                                       | not started                                                                                           |
| Unknown status or priority                                      | **error** for the row                                                                                 |
| Date that is not `YYYY-MM-DD`                                   | **error** for the row                                                                                 |
| Pull request link that is not http(s)                           | **error** for the row                                                                                 |
| No title; title over 500 or description over 100,000 characters | **error** for the row                                                                                 |
| Project title that matches one project                          | the task goes in it (trimmed, ignoring case; archived projects don't count)                           |
| Project title that matches none, or several                     | imported without a project, with a **warning**                                                        |
| Project on a subtask                                            | ignored: a subtask takes its top-level task's project                                                 |
| `source` other than `local` (a synced task)                     | **skipped**: its integration brings it back                                                           |
| `id` of a task already in the workspace                         | **skipped**, so importing an export twice adds nothing                                                |
| Subtask of a row not imported                                   | **skipped**                                                                                           |
| CSV `parent_id` that names no row                               | imported as a top-level task, with a **warning**                                                      |
| CSV `id` repeated, or `parent_id` chain that loops              | **error** for the rows concerned                                                                      |
| Nested more than 32 levels                                      | **error** for the rows below                                                                          |

Status and priority are read ignoring case, spaces and hyphens (`In progress`, `in-progress`), and
`todo`, `done` and `canceled` are accepted. An unknown value is an error, not a default: a
`blocked` or `urgent` from another tool means something, and guessing would import it wrong
without saying so. The row is listed with what to write instead.

Projects are matched, never created: a project needs a due date and a status of its own, which a
task row doesn't carry.

Linked events and notes, completion times and creation times are not imported: their ids belong to
the workspace they came from, and core stamps times when it creates a task. A task imported as
completed is completed as of the import.

**Bad rows are skipped, the rest imported.** A file from another tool often has a few rows DevBrain
can't read; failing the whole file for them would make the user fix every row before importing
any. Every row is checked before anything is written, then all the good rows are created in one
transaction (`TaskService.createTaskTrees`), so an import adds everything it reports or nothing.
The summary lists every row left out, by row number and with the reason, so the user can fix those
rows and import them on their own. Because a row with the `id` of an existing task is skipped,
importing the corrected export again only adds what was missing.

The summary:

```ts
{
  created: number; // tasks created, subtasks included
  skipped: {
    (row, title, message);
  }
  []; // left out on purpose
  errors: {
    (row, title, message);
  }
  []; // invalid rows
  warnings: {
    (row, title, message);
  }
  []; // imported, without something
}
```

A file DevBrain can't read at all (too large, not UTF-8, invalid JSON, no `title` column, a quote
that never closes, another extension) fails with `ImportFileError` (code `import_file`, with
`reason` and `fileName` in `data`), and nothing is imported.

### Export

- Every active task, subtasks included, oldest first. Archived tasks (the archive is DevBrain's
  trash) are left out; a subtask whose parent is archived is written as a top-level task.
- Synced tasks are included, marked with `source` (`linear`), `externalKey` and `externalUrl`. An
  import skips them, so an export is a full record without copies of synced tasks coming back as
  local ones.
- The save dialog proposes `DevBrain tasks YYYY-MM-DD.csv` (or `.json`) and asks before replacing a
  file.

## Notes

### Markdown

One note per file, its body the note's markdown. Front matter is optional:

```markdown
---
title: Kickoff
project: Website
id: nte_0193…
---

# Agenda
```

- `title`: the note's title. Without one, the file's name without its extension.
- `project`: a project's title, matched as for tasks; no match or several is a warning.
- `id`: written by an export; a note with that id already in the workspace is skipped.
- Other keys are ignored. Front matter must be YAML key-value pairs at the very start of the file;
  a `---` rule further down is part of the body.
- Files ending in `.md`, `.markdown` or `.txt`. A file that can't be read, isn't UTF-8 or has bad
  front matter is an error in the summary (by file name), and the other files still import.
- All the notes that pass are created together (`NoteService.createNotes`): every file is written,
  then every row in one transaction, and the files are removed again if that fails.

### Export

- Every active note, into a new folder inside the folder the user picks, named
  `DevBrain notes YYYY-MM-DD` (`… (2)` and so on when it exists). Nothing outside that folder is
  written, and nothing in it is overwritten.
- Each note is `<title>.md` with front matter `title`, `project` (when it has one) and `id`. File
  names are made safe: path separators and characters file systems refuse become `-`, leading dots
  and trailing dots and spaces are dropped, Windows device names (`CON`, `NUL`, …) get a `_`, names
  are cut at 100 characters, and an untitled note is `Untitled`. Names that clash (ignoring case)
  get ` (2)`, ` (3)`, ….
- A note whose file can't be read is left out and listed in `errors`; archived notes are left out.

## Safety

Imported files are untrusted input, like synced content
([security/untrusted-content.md](security/untrusted-content.md)):

- **Size caps** (`limits.ts`), checked before a file is read and again while reading, so a file that
  grows meanwhile is caught: 10 MB and 10,000 tasks for a task file; 5 MB per note file; 1,000 note
  files and 50 MB per note import.
- **Text only.** A file must be UTF-8 without NUL bytes, and must be a regular file (a symlink is
  followed to what it points at; a directory, FIFO or device is refused before it is opened).
- **No paths from files.** Nothing in an imported file is used as a path: a note's `id` or any
  `filePath`-like key is only data, and every note is written to the workspace's `notes/` folder
  under a new id. Links and images in Markdown are kept as text and never fetched or copied.
- **Export names** are built from titles by `safeFileName` and checked by `childPath` to land
  directly inside the export folder, so a title like `../../x` can't write anywhere else.
- **Parsing.** JSON is read with `JSON.parse` and only known keys, own properties only, are read.
  Front matter is read with js-yaml's safe `load`. CSV is parsed by `csv-parse`.
- **Rendering.** Imported titles, descriptions and note content are text and Markdown like any
  other, and follow the rendering rules in untrusted-content.md.
- **Messages** name a file by its base name only, never its full path.

## Change events, search and recents

Imports go through `TaskService.createTaskTrees` and `NoteService.createNotes`, which send a
`created` change for each task or note, as the transaction's last step. So search indexes them in
the same transaction, the IPC layer reports `changed: ['task']` or `['note']`, and the renderer
refetches, exactly as for items created by hand. Imported items are not marked as viewed, so they
don't appear in Recents until opened, like any new item.

## How long an import takes

An import runs on the main process from start to end, as every database write does: better-sqlite3
is synchronous, and the rows go in one transaction so the import is all or nothing. Nothing else in
the app runs meanwhile, so the cost is kept small and in proportion to the rows:

- **Parsing** is synchronous too. At the size limit it takes about 0.2 s, too little to be worth a
  streaming parser that yields between chunks.
- **Rows go in a few hundred per statement.** `createTaskTrees` builds every row first, with its id,
  so a subtask can name its parent before anything is written, then inserts them 500 at a time.
- **Search only inserts.** A created task or note has no entry yet, so the workspace indexes it with
  `indexCreatedTask` / `indexCreatedNote`, which insert without deleting first. Replacing an entry
  deletes by `entity_id`, which the FTS5 table can't index, so that delete reads the whole index;
  done per row, it made an import's cost grow with the square of its rows.
- **The cap** is 10,000 tasks per file, which bounds the pause.

Measured on a workspace database file (WAL, search kept in step), tasks with 350-character
descriptions, a quarter of them top-level with three subtasks each:

| Tasks          | Import (parse, check, write, index) |
| -------------- | ----------------------------------- |
| 2,500          | about 0.3 s                         |
| 10,000 (limit) | about 1 s                           |

An export reads the tasks back through `listTasks`, a page of 200 at a time (`collectPages`), and
takes about 0.2 s for 10,000.

Before batching and insert-only indexing, 20,000 tasks took 38 s, 2,000 took 0.85 s.
`tests/transfer/performance.test.ts` checks the limit stays within a few seconds and that four times
the rows costs about four times as long; run it with `DEVBRAIN_PERF=1`.
