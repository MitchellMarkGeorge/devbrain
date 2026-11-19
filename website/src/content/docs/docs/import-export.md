---
title: Import and export
description: Bring tasks and notes into DevBrain, and take them out again.
---

Find import and export in **Settings › Import & export**, or in the menu bar's **File › Import**
and **File › Export**. Imports go into the open workspace.

## Tasks

Import tasks from a **CSV** or **JSON** file, and export a workspace's tasks as either.

### CSV

One row per task, with a header row. Only `title` is required; headers match ignoring case, spaces
and underscores (`Due Date` and `due_date` are the same column), and other columns are ignored, so
most spreadsheets import as they are.

| Column             | Values                                                 |
| ------------------ | ------------------------------------------------------ |
| `title`            | Required                                               |
| `description`      | Markdown                                               |
| `status`           | `not_started`, `in_progress`, `completed`, `cancelled` |
| `priority`         | `low`, `medium`, `high`                                |
| `start_date`       | `YYYY-MM-DD`                                           |
| `due_date`         | `YYYY-MM-DD`                                           |
| `project`          | A project's title                                      |
| `pull_request_url` | A link to the task's pull request                      |
| `id`, `parent_id`  | Make a row a subtask of the row whose `id` it names    |

`todo`, `done` and `canceled` are accepted as statuses too.

### JSON

An export writes this shape, and an import also takes a bare array of tasks. Every key but `title`
is optional, and `subtasks` can nest.

```json
{
  "format": "devbrain.tasks",
  "version": 1,
  "tasks": [
    {
      "title": "Launch v2",
      "status": "in_progress",
      "priority": "high",
      "dueDate": "2026-11-05",
      "project": "Website",
      "subtasks": [{ "title": "Write copy" }]
    }
  ]
}
```

### How tasks are imported

- **Projects are matched by title**, ignoring case. A project is never created: create it first. A
  task whose project isn't found (or matches more than one) is imported without one, and the
  summary says so.
- **Empty fields get your defaults**: no due date takes the **Default due date** (a subtask takes
  its parent's), no priority the **Default priority**, and no status is Not started.
- **Rows with an error are skipped**, and the rest are imported: an unknown status or priority, a
  date that isn't `YYYY-MM-DD`, a pull request link that isn't a web address, a missing title, or a
  `parent_id` that loops. The summary lists every skipped row by number, so you can fix them and
  import that file again.
- **Nothing is imported twice.** A task whose `id` is already in the workspace is skipped, so
  importing the same export again adds nothing.
- Links to events and notes, and when a task was created or completed, aren't imported. A task
  imported as completed is completed as of the import.

A whole file is refused, with nothing imported, if it isn't CSV or JSON, isn't UTF-8 text, has no
`title` column, or is bigger than 10 MB or 10,000 tasks.

### Exporting tasks

**Export tasks** saves every task you made in DevBrain as CSV or JSON, with its subtasks. Tasks in
the trash and tasks synced from Linear are left out. A CSV export is marked as UTF-8, so spreadsheet
apps read its accents and emoji correctly.

## Notes

Import notes from Markdown files (`.md`, `.markdown` or `.txt`), one note per file. Front matter is
optional:

```markdown
---
title: Kickoff
project: Website
---

# Agenda
```

Without a `title`, a note is named after its file. `project` files it in a project, matched by
title as for tasks. A file that can't be read is listed in the summary, and the others are still
imported. Each import takes up to 1,000 files, of up to 5 MB each.

Images and links in imported notes are never downloaded; see
[what the editor doesn't show](/docs/notes/#what-the-editor-doesnt-show).

### Exporting notes

**Export notes** asks for a folder, then writes every note (except those in the trash) as a
Markdown file named after its title, with this front matter, into a new folder named
`DevBrain notes <date>` inside it. Nothing already there is ever overwritten: names that clash get
" (2)", " (3)" and so on.
