# Performance with a large workspace

How DevBrain behaves with about 10,000 tasks: how to make such a workspace, how to measure it, what
was found, and budgets to check against. Measured in November 2026 on Linux (Electron 42 under
xvfb, a production build of the renderer), on `main`.

**In short.** Lists, pages, search and the calendar are fast at this size: every list query costs
1–7 ms in main, every page paints in 35–150 ms, and a sync page refetches a handful of queries. Four
things are not, listed under [Findings](#findings) with what a fix was measured to give:

| What                                     | Now                                      | Matters in real use?                     |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Tasks list scrolled past 1,000 rows      | stops loading at row 1,000 (a bug)       | Yes, past 1,000 tasks in a view          |
| Status of 200 tasks (`tasks.updateMany`) | 880 ms in main, blocking it              | Only for large workspaces and selections |
| Opening a note with hundreds of to-dos   | 4.1 s for the seed's 200 KB note         | Only for very long checklist notes       |
| A note's mentions                        | one IPC call each, again after each save | Hardly: about 1 ms per mention           |

## The large workspace

`npm run seed:large` (`setup_dev_workspace.mts --size=large`) makes it through the services the app
uses, so every rule, index and search entry is as the app would make them:

| Rows               | Count                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects           | 200 (the 15 base projects, then each per team), mixed statuses                                                                                                                                    |
| Tasks              | 10,823: 6,175 top-level and 4,648 subtasks (1,001 of them the task tree below); 15% of the regular ones undated                                                                                   |
| Notes              | 3,023: p50 0.5 KB, p90 10 KB, p99 51 KB, and one synthetic note of 200 KB with 364 to-dos, 70 code blocks and ~550 mentions, far more than a real note holds ("Engineering handbook (long note)") |
| Events             | 5,000: 30 recurring series (6 kinds for 5 teams, from six months back) and 4,970 one-offs over ±180 days                                                                                          |
| Task tree          | one High parent with 1,000 subtasks, a hundred under it and nine under each of those ("Migrate every endpoint to v2 (1,000 subtasks)"), which the task list sends alone and expands on a click    |
| Favorites, recents | 67 favorites; 231 entities viewed                                                                                                                                                                 |
| Trash              | about 1,180 rows (10 projects with their tasks and notes, 300 tasks, 100 notes)                                                                                                                   |

The database is about 40 MB and the search index holds 16,861 entries. The seed is deterministic
(`--seed`, 42 by default); dates are relative to the day it runs. It takes about 40 s.

```sh
npm run seed:large -- --path=.perf --reset      # its own DevBrain folder; --name to rename
```

## How to measure

Two scripts, one for main's code alone and one for the app as a person uses it.

**Core and SQL: `npm run perf:core -- --path=.perf [--plans] [--runs=30] [--json=out.json]`.**
Opens the workspace in Node (on Electron's, like the seed) and times each read a page makes, with
the inputs the pages send, then a bulk and a single write (which it undoes). It records every
statement each read runs and prints its `EXPLAIN QUERY PLAN` with `--plans`, flagging a scan of a
whole table and a temporary sort. It also times `workspaces.open` and the copy of the database that
opening makes.

**The app: `npm run build`, then `xvfb-run -a npm run perf:app -- --path=.perf [--json=out.json]`**
(no xvfb on a desktop). Launches the built app through Playwright's Electron driver (from
`@playwright/test`, which the end-to-end tests already install) and walks through startup, a
switch, every page, scrolling, the long note, ⌘K, a bulk edit and a sync page. Each step is timed in
the page, from the navigation to the frame its content first shows (polled each animation frame),
with the renderer's long tasks (over 50 ms) counted. Main's IPC handler is wrapped for the run, so
each step also reports its calls, their time in main and their size. A sync page is played as main's
`db.changes` push for the tasks, projects and events a page writes, which is what the renderer sees
of one.

The app run writes to the workspace (a second workspace to switch to, typing in the long note, the
status of 200 tasks), so run it on a copy, or seed again. A DevBrain folder's registry records
absolute paths: copy one with its `workspaces.json` pointed at the copy, or seed a fresh one. Numbers
move by 10–20% between runs on the same machine; compare medians of a few runs, and compare a change
against `main` on the same machine.

## The numbers

App, large workspace. Times are to the first frame showing the step's content; long tasks are the
renderer's.

| Step                                         | `main`                                            |
| -------------------------------------------- | ------------------------------------------------- |
| Startup, launch to Home                      | 1.55–1.59 s                                       |
| Switch to another workspace                  | 644 ms                                            |
| Switch back, to Tasks                        | 714 ms (302 ms in main)                           |
| Home                                         | 67 ms, 9 calls                                    |
| Tasks list, first paint                      | 77 ms, 2 calls, 172 KB                            |
| Tasks list, scrolled to the end              | stops at 1,000 rows (10 calls)                    |
| Tasks grouped by project                     | 112–146 ms, 49 calls, 1.6 MB                      |
| Board                                        | 55 ms, 5 calls                                    |
| Open a task (subtasks, a note)               | 96 ms, 13 calls, 541 KB                           |
| Notes cards                                  | 35 ms, 3 calls                                    |
| Open the 200 KB note                         | 4.1 s, a 4 s long task; 574 calls, 596 ms in main |
| Type in it, per key p50 / p95                | 33 / 63 ms                                        |
| Its autosave and the refetch                 | 555 calls, 1.1 s in main                          |
| Projects list, leaving the note              | 487 ms (a 457 ms long task)                       |
| Calendar month                               | 158–262 ms, 1 MB of events                        |
| Calendar week                                | 143 ms (a 109 ms long task)                       |
| Trash                                        | 43 ms                                             |
| Tasks list, again                            | 78 ms, 11 calls                                   |
| ⌘K, "design system", last key to last answer | 264 ms (120 ms of it the debounce)                |
| Status of 200 tasks                          | write 881 ms; 14 calls, 938 ms in main            |
| A sync page with the tasks list open         | 14 calls, 67 ms in main                           |
| A sync page with the month open              | 6 calls, 14 ms in main                            |
| A sync page with Home open                   | 12 calls, 29 ms in main                           |

Core (`perf:core`), p50 / p95 over 30 runs:

| Call                                            | `main`           | Size        |
| ----------------------------------------------- | ---------------- | ----------- |
| `workspaces.open`                               | 252 / 271 ms     |             |
| of which the copy of the database               | 242 / 271 ms     |             |
| `tasks.list`, a page of 100 (list, Home, board) | 2.2–3.3 / 3–6 ms | 70–78 KB    |
| `tasks.list`, a project's group                 | 1.9 / 4.3 ms     | 71 KB       |
| `tasks.get`, `tasks.subtasks`                   | 0.5 / 0.8 ms     | 1 KB        |
| `projects.list`, 200 with stats                 | 6.7 / 11 ms      | 93 KB       |
| `notes.list`, 100                               | 1.2 / 1.6 ms     | 99 KB       |
| `notes.readContent`, 200 KB                     | 0.9 / 5.7 ms     | 203 KB      |
| `events.listForCalendar`, a week / a month grid | 3.2 / 6.8 ms     | 77 / 382 KB |
| `search.search` "design system" / "d"           | 6.2 / 14.4 ms    | 40–49 KB    |
| `search.counts`                                 | 3.1 ms           |             |
| recents, favorites, trash pages                 | 0.6–0.8 ms       |             |
| `tasks.updateMany`, 200 tasks                   | 865 / 878 ms     |             |
| `tasks.updateStatus`, twice                     | 10.6 / 14.6 ms   |             |

### The task tree

The tasks list and group view read `tasks.tree` ([the task list as a tree](renderer/task-tree.md)).
Measured against `main` on the same machine and the same seed (on `main`, without the 1,000-subtask
parent), in November 2026:

| Step                                  | `main` (`tasks.list`)             | `tasks.tree`                          |
| ------------------------------------- | --------------------------------- | ------------------------------------- |
| Tasks list, first paint               | 92 ms, 12.6 ms in main            | 74 ms, 17 ms in main                  |
| Expand the parent with 1,000 subtasks |                                   | 194 ms; `tasks.subtree` 15 ms, 645 KB |
| Tasks list, scrolled to the end       | 36 s, 89 pages, 2 s of long tasks | 23 s, 55 pages, 0.6 s of long tasks   |
| Tasks grouped by project              | 108 ms, 47 groups, 126 ms in main | 139 ms, 47 groups, 184 ms in main     |
| A change with the whole list loaded   | 89 pages, 245 ms in main          | 56 pages, 300 ms in main              |

In core, p50 / p95 over 30 runs: a page of 100 roots by priority costs 6.8 / 8.1 ms (120 KB), open
tasks by due date 3.2 / 4.0 ms, a project's group 2.3 / 4.0 ms, against 1.4–2 ms for a page of
`tasks.list`; `tasks.subtree` for the 1,000 costs 11.5 / 19 ms. The page by priority is the
slowest because the seed's 1,000 High subtasks are the newest High rows, which the roots query
reads past. Over all 191 project groups, open or not, a page of the tree costs 1.6 times a page of
`tasks.list`. The walk down the subtrees names the parent index: without it, the "No project" group
read the project index at every step, 450 ms for the 1,000.

### The SQL

Every list and search query uses an index for its filter and its keyset order (`--plans`). The only
flags are temporary sorts of small sets, none worth an index:

- a board column (`status`, then priority order) and a project's group sort their rows by priority
  in a temporary tree: 1.9–3.3 ms for a page;
- the active projects by due date, and a note's tasks, sort a few hundred rows or fewer;
- search orders its matches by rank (`bm25`), which no index can give, and `search.counts` groups by
  type: 3–14 ms, the most a one-letter query.

The one missing index is the search index's own (finding 2).

## Findings

Each with what it costs, when it matters, and what a fix was measured to give. The fixes were built
and measured in pull requests #192–#195, which were not merged; they hold the code, the tests and
the full numbers.

### 1. The paged lists stop loading at ten pages

The tasks, notes, projects, trash and subtask lists set React Query's `maxPages: 10`. Past ten pages
it drops the first page as each new one loads; none of these queries has a `getPreviousPageParam`,
so a dropped page never loads again, and once the loaded count stops growing the list's "near the
end" check stops firing. The tasks list ends at row 1,000 of 8,859, however far you scroll. The
notes and projects lists would end at 1,000 rows, the trash at 500.

This is the one finding that matters at ordinary sizes: completed tasks show by default, so a
steady user's list passes 1,000 rows within a year or so.

**Fix (#193):** drop `maxPages`, so every loaded page stays. The list then reaches row 8,859 (88
more calls, about 0.4 s of main's time spread over the scroll). The cost is the refetch after a
change, which reloads every loaded page: 89 pages, about 0.6 s, for a list scrolled to its very end;
unchanged for the first page or two. Coming back to a list scrolled that far also refetches every
page (90 calls, 342 ms in main); cutting an unseen list back to its first page would make that one
call.

### 2. Every task edit reads the whole search index

`search_index` is FTS5, which can't index `entity_id`, so replacing or removing an entry by id reads
the whole index: 5.7 ms per entry at 16,861 entries, against 0.006 ms by rowid. Every task update
re-indexes the task, so the status of 200 tasks spends 881 ms in main, and a single edit about 5 ms.
The cost grows with the index: at about 2,000 entries (1,000 tasks) it is 0.6 ms an entry, so a
20-task bulk edit costs about 12 ms. Separately, a batch of more than about 8,190 entries fails
outright, past SQLite's 32,766 bound variables in one statement: restoring that many tasks from the
trash at once would throw.

**Fix (#192):** a `search_index_entries` table mapping each entity to its FTS rowid (a generated and
a data migration), with deletes going through it, and batches written in chunks. Status of 200
tasks: 881 → 43 ms; a single edit: 5 → 0.8 ms; search unchanged; an import of 10,000 tasks about
0.2 s slower for the extra row.

### 3. Notes with hundreds of to-dos open slowly

Opening the seed's 200 KB note takes 4.1 s, almost all one renderer long task:

- **1.8 s in Tiptap's `captureDOMSelection`.** Every React node view with a `NodeViewContent`
  reads the page's selection as it mounts. With nothing selected, as while a note opens, Chromium
  lays the whole page out to answer (2.2 ms a read on this note), so each of the 364 to-dos laid
  out a page growing with each one before it. The same code is in the latest `@tiptap/react`.
- **About 0.6 s parsing the markdown**, with our block tokenizers' `start` patterns run at every
  position, and 0.5 s mounting the 70 code blocks' React node views.
- **Typing** costs 33 ms a key (p50), three quarters of it `editor.getMarkdown()` serializing the
  whole note on every keystroke. Leaving the note costs a 457 ms long task tearing it down.

A note with a few dozen to-dos is not affected; a note of the p99 size (51 KB) costs about a
quarter of each.

**Fix (#194):** to-dos as a plain node view with only the `Checkbox` in React (a `ReactRenderer`,
which has no content element), and `content-visibility: auto` on top-level paragraphs, headings,
lists, code blocks and rules (not quotes, callouts, sections or tables, whose children's margins
containment would stop collapsing). A note with every element laid out and painted identically.
Open: 4.1 → 2.3 s; typing p50: 33 → 25 ms. Making `getMarkdown()` lazy would change
`RichTextEditor`'s `onChange` contract, and was left.

### 4. Each mention is its own IPC call

Each mention in a note (an `@` link, drawn as a pill) reads its entity with its own `get`
(`tasks.get`, `projects.get`, …), and all of them refetch after every save, since a save reports
`note` and the `tasks` routes read notes. About 1 ms each: tens of milliseconds for a note with a few
dozen mentions, which nobody notices. Only the seed's synthetic note (574 calls on opening, 555
after a save) makes it show.

**Option (#195):** a `notes.mentions({ ids })` route that loads every mentioned entity with at most
one query per type, the pills' fetches gathered into one call per turn. Worth it for the design
(one place to load and judge mention data), not for speed.

## Measured and fine

- **Startup** is about 0.95 s of Electron starting the process and the window, then the workspace
  open held for `SPLASH_MINIMUM_MS` (600 ms), then the page. Opening the workspace (252 ms, 242 of it
  the backup copy `Workspace.open` makes on every open) runs inside those 600 ms, and so does the
  switch's, so making the copy in the background changed nothing a person sees at this size. It
  would past about 100 MB of database; the copy grows with it.
- **The group view** (T1) opens in 112–146 ms with one `tasks.list` per group on screen (47 calls,
  1.4 MB, most of it rows below the fold). The plan's bar for T1 is a slow open; this isn't one.
- **Refetches after a change** stay small: a sync page refetches 6–14 queries, under 70 ms of main's
  time. `ENTITIES_READ_BY_ROUTE` needs no tighter lines for now.
- **The task page** loads five weeks of events (319 KB) for its event picker before the picker
  opens, and the month view three months of events (1 MB) to page quickly: both paint in under
  300 ms.
- **P2** (project health) is a feature, not a cost; nothing here calls for it.

## Budgets

For the large seed, measured as above (Linux, xvfb). A change that breaks one should say why in its
PR, with the before and after. **Over** marks a budget `main` misses today, with the finding that
explains it.

| What                                                                     | Budget                   | `main`                       |
| ------------------------------------------------------------------------ | ------------------------ | ---------------------------- |
| Startup, launch to Home                                                  | 2 s                      | 1.6 s                        |
| Workspace switch                                                         | 800 ms                   | 0.64–0.71 s                  |
| A page's first paint: Home, Tasks, board, a task, Notes, Projects, Trash | 150 ms                   | 35–96 ms                     |
| The group view, the calendar's month and week                            | 300 ms                   | 112–262 ms                   |
| Any renderer long task, outside the 200 KB note                          | 150 ms                   | ≤ 109 ms                     |
| A list or `get` call in core, p95                                        | 15 ms                    | ≤ 11 ms                      |
| `search.search`, p95                                                     | 25 ms                    | 18 ms                        |
| A list scrolls to its last row                                           | always                   | **Over:** stops at 1,000 (1) |
| A single-task write                                                      | 5 ms                     | about 5 ms (2)               |
| A bulk write of 200 tasks                                                | 100 ms                   | **Over:** 881 ms (2)         |
| What a change or a sync page refetches                                   | 15 calls, 100 ms in main | ≤ 14 calls, 67 ms            |
| The 200 KB note: open                                                    | 2.5 s                    | **Over:** 4.1 s (3)          |
| The 200 KB note: typing, per key p50 / p95                               | 30 / 60 ms               | **Over:** 33 / 63 ms (3)     |
