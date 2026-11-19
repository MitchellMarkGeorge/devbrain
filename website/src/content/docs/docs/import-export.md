---
title: Import and export
description: Bring tasks and notes into DevBrain, and take them out again.
---

Find import and export in **Settings › Import & export**, or in the app menu's **File › Import**
and **File › Export**.

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

Without a `title`, a note is named after its file. An export writes every note as a Markdown file
with this front matter, into a new folder named `DevBrain notes <date>`; nothing already there is
overwritten.
