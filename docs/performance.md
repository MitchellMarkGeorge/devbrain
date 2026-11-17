# Performance with a large workspace

How DevBrain behaves with about 10,000 tasks, what was slow, what changed, and the budgets to
check against. Measured in November 2026 on Linux (Electron 42 under xvfb, a production build of the
renderer), from `main` at `ec71bc8`.

**In short.** Lists, pages, search and the calendar were already fast: every list query costs 1–7
ms in main, every page paints in 35–150 ms, and a sync page refetches a handful of queries. The slow
parts were elsewhere:

| What                                     | Before                                  | After             | Change                        |
| ---------------------------------------- | --------------------------------------- | ----------------- | ----------------------------- |
| Status of 200 tasks (`tasks.updateMany`) | 880 ms in main, blocking it             | 43 ms             | #192, search entries by rowid |
| Tasks list scrolled to the end           | stopped at row 1,000 of 8,859           | reaches row 8,859 | #193, keep every page         |
| Opening a 200 KB note                    | 4.1 s, one 4 s long task; 574 IPC calls | 2.3 s; 11 calls   | #194, #195                    |
| Typing in it, per key (p50 / p95)        | 33 / 63 ms                              | 25 / 45 ms        | #194                          |
| Its autosave, and what that refetches    | 555 calls, 1.1 s in main                | 8 calls, 64 ms    | #195, pills in one call       |
| Back on a list you scrolled through      | (n/a: the list stopped at 10 pages)     | 1 call            | #193, trimmed pages           |

## The large workspace

`npm run seed:large` (`setup_dev_workspace.mts --size=large`) makes it through the services the app
uses, so every rule, index and search entry is as the app would make them:

| Rows               | Count                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects           | 200 (the 15 base projects, then each per team), mixed statuses                                                                                        |
| Tasks              | 9,822: 6,174 top-level and 3,648 subtasks; 15% of the regular ones undated                                                                            |
| Notes              | 3,023: p50 0.5 KB, p90 10 KB, p99 51 KB, and one of 200 KB with 364 to-dos, 70 code blocks and ~550 entity pills ("Engineering handbook (long note)") |
| Events             | 5,000: 30 recurring series (6 kinds for 5 teams, from six months back) and 4,970 one-offs over ±180 days                                              |
| Favorites, recents | 67 favorites; 231 entities viewed                                                                                                                     |
| Trash              | about 1,180 rows (10 projects with their tasks and notes, 300 tasks, 100 notes)                                                                       |

The database is about 40 MB and the search index holds 16,861 entries. The seed is deterministic
(`--seed`, 42 by default); dates are relative to the day it runs. It takes about 45 s.

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
(no xvfb on a desktop). Launches the built app through Playwright's Electron driver
(`npm i --no-save playwright-core` if it is missing: it isn't a dependency of the app) and walks
through startup, a switch, every page, scrolling, the long note, ⌘K, a bulk edit and a sync page.
Each step is timed in the page, from the navigation to the frame its content first shows (polled
each animation frame), with the renderer's long tasks (over 50 ms) counted. Main's IPC handler is
wrapped for the run, so each step also reports its calls, their time in main and their size. A sync
page is played as main's `db.changes` push for the tasks, projects and events a page writes, which
is what the renderer sees of one.

The app run writes to the workspace (a second workspace to switch to, typing in the long note, the
status of 200 tasks), so run it on a copy, or seed again. A DevBrain folder's registry records
absolute paths: copy one with its `workspaces.json` pointed at the copy, or seed a fresh one. Numbers
move by 10–20% between runs on the same machine; compare medians of a few runs, and compare a change
against `main` on the same machine.

## The numbers

App, large workspace. "Before" is `main`; "after" is `main` with #192–#195. Times are to the first
frame showing the step's content; long tasks are the renderer's.

| Step                                         | Before                                 | After                                |
| -------------------------------------------- | -------------------------------------- | ------------------------------------ |
| Startup, launch to Home                      | 1.55–1.59 s                            | 1.56–1.62 s                          |
| Switch to another workspace                  | 644 ms                                 | 659 ms                               |
| Switch back, to Tasks                        | 714 ms (302 ms in main)                | 735 ms                               |
| Home                                         | 67 ms, 9 calls                         | 68 ms                                |
| Tasks list, first paint                      | 77 ms, 2 calls, 172 KB                 | 69 ms                                |
| Tasks list, scrolled to the end              | stops at 1,000 rows                    | 8,859 rows, 88 calls, 402 ms in main |
| Tasks grouped by project                     | 146 ms, 49 calls, 1.6 MB               | 128 ms                               |
| Board                                        | 55 ms, 5 calls                         | 60 ms                                |
| Open a task (subtasks, a note)               | 96 ms, 13 calls, 541 KB                | 94 ms                                |
| Notes cards                                  | 35 ms, 3 calls                         | 38 ms                                |
| Open the 200 KB note                         | 4.1 s; 574 calls, 596 ms in main       | 2.3 s; 11 calls, 34 ms in main       |
| Type in it, per key p50 / p95                | 33 / 63 ms                             | 25 / 45 ms                           |
| Its autosave and the refetch                 | 555 calls, 1.1 s in main               | 8 calls, 64 ms                       |
| Projects list, leaving the note              | 487 ms (a 457 ms long task)            | 358 ms (326 ms)                      |
| Calendar month                               | 158–262 ms, 1 MB of events             | 134 ms                               |
| Calendar week                                | 143 ms (a 109 ms long task)            | 156 ms                               |
| Trash                                        | 43 ms                                  | 46 ms                                |
| Tasks list, again                            | 78 ms, 11 calls                        | 86 ms, 2 calls                       |
| ⌘K, "design system", last key to last answer | 264 ms (120 ms of it the debounce)     | 266 ms                               |
| Status of 200 tasks                          | write 881 ms; 14 calls, 938 ms in main | write 43 ms; 7 calls, 66 ms in main  |
| A sync page with the tasks list open         | 14 calls, 67 ms in main                | 7 calls, 22 ms                       |
| A sync page with the month open              | 6 calls, 14 ms in main                 | 6 calls, 15 ms                       |
| A sync page with Home open                   | 12 calls, 29 ms in main                | 12 calls, 29 ms                      |

Core (`perf:core`), p50 / p95 over 30 runs:

| Call                                            | Before           | After         | Size        |
| ----------------------------------------------- | ---------------- | ------------- | ----------- |
| `workspaces.open`                               | 252 / 271 ms     | unchanged     |             |
| of which the copy of the database               | 242 / 271 ms     |               |             |
| `tasks.list`, a page of 100 (list, Home, board) | 2.2–3.3 / 3–6 ms | unchanged     | 70–78 KB    |
| `tasks.list`, a project's group                 | 1.9 / 4.3 ms     | unchanged     | 71 KB       |
| `tasks.get`, `tasks.subtasks`                   | 0.5 / 0.8 ms     | unchanged     | 1 KB        |
| `projects.list`, 200 with stats                 | 6.7 / 11 ms      | unchanged     | 93 KB       |
| `notes.list`, 100                               | 1.2 / 1.6 ms     | unchanged     | 99 KB       |
| `notes.readContent`, 200 KB                     | 0.9 / 5.7 ms     | unchanged     | 203 KB      |
| `events.listForCalendar`, a week / a month grid | 3.2 / 6.8 ms     | unchanged     | 77 / 382 KB |
| `search.search` "design system" / "d"           | 6.2 / 14.4 ms    | 5.7 / 14.4 ms | 40–49 KB    |
| `search.counts`                                 | 3.1 ms           | unchanged     |             |
| recents, favorites, trash pages                 | 0.6–0.8 ms       | unchanged     |             |
| `tasks.updateMany`, 200 tasks                   | 865 / 878 ms     | 33 / 43 ms    |             |
| `tasks.updateStatus`, twice                     | 10.6 / 14.6 ms   | 1.0 / 7.2 ms  |             |

### The SQL

Every list and search query uses an index for its filter and its keyset order (`--plans`). The only
flags are temporary sorts of small sets, none worth an index:

- a board column (`status`, then priority order) and a project's group sort their rows by priority
  in a temporary tree: 1.9–3.3 ms for a page;
- the active projects by due date, and a note's tasks, sort a few hundred rows or fewer;
- search orders its matches by rank (`bm25`), which no index can give, and `search.counts` groups by
  type: 3–14 ms, the most a one-letter query.

The one missing index was the search index's own: FTS5 can't index `search_index.entity_id`, so each
entry replaced or removed by id read the whole index, 5.7 ms each at 16,861 entries against 0.006 ms
by rowid. #192 adds the map from id to rowid. (The seed also found that a batch of more than about
8,190 entries failed outright, past SQLite's 32,766 bound variables; #192 writes in chunks.)

## What changed

- **#192, search entries found by rowid.** `search_index_entries` maps each entity to its FTS
  row; migrations 0028 (generated) and 0029 (fills it). Every task edit re-indexes the task, so
  every edit got cheaper, and a bulk edit stopped blocking main for most of a second.
- **#193, the paged lists keep every page.** `maxPages: 10` dropped the first pages with no way to
  load them back, and the list stopped loading: the tasks list ended at row 1,000. Every page now
  stays while a list is shown, and is cut back to the first once nothing shows it
  (`src/renderer/ipc/trim-pages.ts`), so returning to a list refetches one page.
- **#194, long notes.** To-dos are a plain node view with only the `Checkbox` in React: each
  `NodeViewContent` read the page's selection as it mounted, which with nothing selected lays the
  whole page out (1.8 s of the 4 s). Top-level paragraphs, headings, lists, code and rules get
  `content-visibility: auto`, so blocks away from the view skip layout, on opening and on each key.
- **#195, entity pills in one call (R2).** `entities.summaries({ ids })`; the pills' queries are
  gathered into one call per turn, so a note with 550 pills loads them, and refetches them after a
  save, in two calls rather than 555.

## Measured, and left as it is

- **Startup** is about 0.95 s of Electron starting the process and the window, then the workspace
  open held for `SPLASH_MINIMUM_MS` (600 ms), then the page. Opening the workspace (252 ms, 242 of it
  the backup copy `Workspace.open` makes on every open) runs inside those 600 ms, and so does the
  switch's, so making the copy in the background changed nothing a person sees at this size. It
  would past about 100 MB of database; the copy grows with it.
- **The group view** (T1) opens in 112–146 ms with one `tasks.list` per group on screen (47 calls,
  1.4 MB, most of it rows below the fold). The plan's bar for T1 is a slow open; this isn't one.
- **Refetches after a change** stay small: a sync page refetches 6–14 queries, under 70 ms of main's
  time, and a bulk edit 7. `ENTITIES_READ_BY_ROUTE` needs no tighter lines for now.
- **The long note** still takes 2.3 s to open: about 0.6 s parsing the markdown (our block
  tokenizers' `start` patterns run at every position) and 0.5 s mounting the 70 code blocks' React
  node views, which hit the same selection read as the to-dos did. Typing is mostly
  `editor.getMarkdown()` serializing the whole note on every keystroke (75% of the time per key);
  making that lazy changes `RichTextEditor`'s `onChange` contract. Leaving the note costs a 326 ms
  long task tearing its node views down. A note of the p99 size (51 KB) costs about a quarter of
  each.
- **The task page** loads five weeks of events (319 KB) for its event picker before the picker
  opens, and the month view three months of events (1 MB) to page quickly: both paint in under
  200 ms.
- **P2** (project health) is a feature, not a cost; nothing here calls for it.

## Budgets

For the large seed, measured as above (Linux, xvfb). A change that breaks one should say why in its
PR, with the before and after.

| What                                                                     | Budget                   | Now               |
| ------------------------------------------------------------------------ | ------------------------ | ----------------- |
| Startup, launch to Home                                                  | 2 s                      | 1.6 s             |
| Workspace switch                                                         | 800 ms                   | 0.66–0.74 s       |
| A page's first paint: Home, Tasks, board, a task, Notes, Projects, Trash | 150 ms                   | 38–94 ms          |
| The group view, the calendar's month and week                            | 250 ms                   | 128–156 ms        |
| Any renderer long task, outside a long note                              | 150 ms                   | ≤ 124 ms          |
| A list or `get` call in core, p95                                        | 10 ms                    | ≤ 8 ms            |
| `search.search`, p95                                                     | 25 ms                    | 18 ms             |
| A single-task write                                                      | 5 ms                     | 1 ms              |
| A bulk write of 200 tasks                                                | 100 ms                   | 43 ms             |
| What a change or a sync page refetches                                   | 15 calls, 100 ms in main | ≤ 12 calls, 29 ms |
| IPC calls to open a note                                                 | 15, whatever its pills   | 11                |
| The 200 KB note: open                                                    | 2.5 s                    | 2.3 s             |
| The 200 KB note: typing, per key p50 / p95                               | 30 / 60 ms               | 25 / 45 ms        |
