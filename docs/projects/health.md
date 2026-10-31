# Project health

Status: **proposal**. Nothing here is built. The rules are coded and tested in
`src/main/core/projects/health.ts` (tests: `src/main/core/tests/projects/health.test.ts`), but
no service, route or schema uses them yet. The questions at the end are for you to decide.

## What the designs ask for

The v2 screens (Figma `w9WtYAUXkkzqKIMAzFo08I`, "v2 Screens") put a health badge on every project
card and row, and in the project overview header next to the dates:

- **On track**, **At risk**, **Off track**, and **No update** for a project with nothing to judge.
  The glyphs come from `HealthIcon` and the `health-*` tokens.
- The card's progress bar uses the health colour, next to "40%" and "4 of 10 tasks done". So a list
  item needs progress and health together.
- Neither screen shows why a project has its health. This doc suggests a one-line reason ("2
  overdue tasks", "40% done with 63% of the time gone") as a tooltip on the badge, plus a line in
  the overview's Progress panel.

Two gaps between the designs and the code:

1. `ProjectHealth` has `NOT_STARTED` and `COMPLETED`, and `HealthIcon` has `not-started` and
   `completed`. The designs label the empty state **"No update"**. This doc uses `NOT_STARTED` for
   "no update" and shows it with that label (see question 6).
2. The sample data in the mocks doesn't fit any time-based rule. "Auth Overhaul" shows **On track**
   at 25% done, 19 of 30 days in, with two high-priority tasks overdue. Read the mocks as layout,
   not as rules.

## 1. Computed, manual or both?

| Option                                   | For                                                                                                                            | Against                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Computed** from tasks and dates    | Always there and always current. No new habit for a single user. Explains itself. Works for every existing project on day one. | Can't know what isn't in DevBrain: work outside the tasks, a deadline that is soft, a scope cut. Thresholds are a guess.                                                                 |
| **(b) Manual**, like a Linear update     | Says what the user means, with a note. Matches Linear's model.                                                                 | Most projects would show "No update" for good: a solo developer seldom writes status updates for themselves. Goes stale silently. Needs a table, routes and UI before it shows anything. |
| **(c) Computed, with a manual override** | Best of both: correct by default, and the user can overrule it ("the overdue tasks don't matter, on track") with a note.       | Two sources to explain in the UI ("set by you" vs computed). Needs rules for when an override ends. Most of the cost of (b) on top of (a).                                               |

**Recommendation: (a) now, built so (c) can be added later.** Ship computed health first. It covers
every project at once and needs no schema change (see section 4). Add the override only if computed
health is wrong often enough to annoy. If you do add it:

- It goes in a `project_health_updates` table (`id`, `project_id`, `health`, `note`,
  `created_at`). That is a new table, so it is one generated migration (step 1 of CLAUDE.md's
  steps; a new table can carry its foreign key from the start).
- The badge shows "Set by you · 3 days ago". When the computed health differs, the tooltip shows it
  under the override ("Computed: at risk, 2 overdue tasks").
- The override ends after 14 days, or when the project's due date or status changes, whichever
  comes first. After that the computed health shows again. An override that never ends is how
  manual health goes stale.

Synced Linear projects are different: their health is Linear's own (section 3).

## 2. Rules

Health is judged in **whole local days**, in the system zone (`shared/dates.ts`). A task due today
isn't overdue until tomorrow. "Time gone" only moves at midnight. So between writes, health only
changes when the day changes, which is what makes section 6 simple.

Inputs, per project, counting **unarchived tasks, subtasks included** (subtasks carry their parent's
`projectId`, and `getProjectStats` counts them too):

- `total`: completed and open tasks (cancelled ones are left out, as in `ProjectStats`)
- `completed`, `cancelled`
- `overdue`: open tasks due before today; `overdueHigh`: the HIGH-priority ones among them
- `openWithDueDate`: open tasks with any due date
- the project's `status`, `startDate`, `dueDate`, `createdAt` and `completedAt`

Two signals are measured. The worse one wins:

- **Schedule**: `done = completed / total`. `elapsed` = days from the start to today ÷ days from
  the start to the due date, capped to 0..1. The start is `startDate`, or `createdAt` when there is
  none. `gap = elapsed − done`.
- **Overdue tasks**: `overdue` and `overdueHigh`.

The rules, first match wins:

| #   | When                                                                 | Health        | Reason shown                                           |
| --- | -------------------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| 1   | status is Completed                                                  | Completed     | "Completed Jun 18" / "Completed 3 days late"           |
| 2   | status is On hold                                                    | No update     | "On hold"                                              |
| 3   | due date is before today                                             | **Off track** | "Due date passed 5 days ago"                           |
| 4   | no open or completed tasks                                           | No update     | "No tasks yet" / "All tasks cancelled"                 |
| 5a  | 3+ overdue tasks, or 2+ overdue HIGH-priority tasks                  | **Off track** | "3 overdue tasks" / "2 overdue tasks, 2 high priority" |
| 5b  | 1–2 overdue tasks                                                    | **At risk**   | "1 overdue task, 1 high priority"                      |
| 5c  | has a due date, started, and ≥ 20% of the time gone: gap > 40 points | **Off track** | "20% done with 63% of the time gone"                   |
| 5d  | … gap > 20 points                                                    | **At risk**   | "40% done with 63% of the time gone"                   |
| 5e  | … otherwise (and before 20% of the time is gone)                     | **On track**  | "60% done with 63% of the time gone"                   |
| 6a  | no signal to measure: every task done                                | On track      | "All tasks done"                                       |
| 6b  | … start date is in the future                                        | No update     | "Starts Jul 1"                                         |
| 6c  | … no due date and no open task has one                               | No update     | "Add a due date to track health"                       |
| 6d  | … no due date, dated tasks all on time                               | On track      | "No overdue tasks"                                     |

When 5a/5b and 5c–5e both apply, the worse one is the headline and the other is in `also`, for the
tooltip ("2 overdue tasks · 70% done with 63% of the time gone"). On a tie, the overdue tasks lead,
as the more concrete reason.

The thresholds are in `HEALTH_THRESHOLDS`, together, so they are easy to tune:

```ts
export const HEALTH_THRESHOLDS = {
  atRiskGap: 0.2, // behind by > 20 points: at risk
  offTrackGap: 0.4, // behind by > 40 points: off track
  graceElapsed: 0.2, // the schedule isn't judged until 20% of the time is gone
  offTrackOverdue: 3,
  offTrackOverdueHigh: 2,
} as const;
```

### Edge cases

| Case                                          | Behaviour                                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No due date                                   | No schedule signal. Judged on overdue tasks alone (5a/5b, 6d). With no dated open task either: "Add a due date to track health" (6c). `createProject` requires a due date, but a synced or edited project can lack one. |
| No start date                                 | The schedule runs from `createdAt`. Synced projects keep Linear's `createdAt`, so that holds for them too.                                                                                                              |
| Start date in the future                      | No schedule yet. Overdue tasks still count (a task due before its project starts is still late). With none: "Starts Jul 1".                                                                                             |
| Start on or after the due date                | Treated as a one-day schedule, never a division by zero.                                                                                                                                                                |
| Due today                                     | 100% of the time is gone, so anything short of done falls behind (5c/5d). It goes "Due date passed" from tomorrow.                                                                                                      |
| First days of a project                       | The 20% grace period stops a project being "at risk" on day two for having nothing done yet.                                                                                                                            |
| No tasks                                      | No update, "No tasks yet". Exception: past due is still Off track (rule 3 comes first).                                                                                                                                 |
| All tasks cancelled                           | Cancelled tasks are left out of `total`, so it is 0: "All tasks cancelled". Some cancelled: left out of the share done.                                                                                                 |
| Every task done, project not marked completed | Before the due date: On track ("All tasks done", or on pace). Past it: Off track, "Due date passed", which nudges the user to mark it completed (see question 4).                                                       |
| On hold                                       | No update, "On hold", even past due. Pausing is a decision, and the dates stop counting. See question 3.                                                                                                                |
| Status Not started                            | **Ignored.** It's `createProject`'s default and most projects keep it. Health goes by dates and tasks, not by that status.                                                                                              |
| Completed                                     | Completed, with how late it was against the due date. Open tasks left in it don't matter.                                                                                                                               |
| Subtasks                                      | Count like tasks, as in `getProjectStats`, so the badge and the "x of y done" agree. See question 5.                                                                                                                    |
| Archived tasks                                | Left out. Archiving a task removes it from the counts, as the stats do.                                                                                                                                                 |
| Archived project                              | Not listed, so it has no health shown. The archive list doesn't need it.                                                                                                                                                |
| Time zones, DST                               | Days are local days. `daysBetween` rounds, so 23- and 25-hour days still count as one. The tests pass under New York, Santiago, Auckland and UTC.                                                                       |

`getProjectStats` counts a task as overdue when `dueDate < now`. Task due dates are stored as local
midnight, so that marks a task due today as overdue from 00:00. The designs show a task due today
as "Today" in orange, not red. Health uses "due before today" instead. Consider making
`numOfOverdue` match, so the stats and the badge agree.

## 3. Synced Linear projects

**Use Linear's health, never a computed one.** DevBrain only mirrors the issues assigned to the user
(`assignedIssues`), so a synced project's tasks are a slice of the real project. "1 of 2 done" says
nothing about a 40-issue project.

Linear exposes `Project.health` (`onTrack` | `atRisk` | `offTrack`, null until someone posts an
update), `Project.healthUpdatedAt`, and `Project.lastUpdate { health body createdAt }`. The mapping:

| Linear                                                         | DevBrain                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `onTrack` / `atRisk` / `offTrack`                              | On track / At risk / Off track, reason "Set in Linear 3 days ago"                       |
| `null` (no update yet)                                         | No update, "No update in Linear yet"                                                    |
| status `completed` or `canceled` (already mapped to COMPLETED) | Completed, whatever the last update said                                                |
| status `paused`                                                | Linear's health as it is. Linear keeps showing it on paused projects, so we do the same |

Code: `healthFromLinear` in `health.ts`. To carry it, add `health healthUpdatedAt` to
`PROJECT_FIELDS` in `linear/queries.ts`, add the matching fields to `linearProjectSchema` and
`ExternalProject`, and store them in the project link's metadata next to `statusLabel`
(`projectLinkMetadataSchema`). That's a JSON column whose missing keys already read as null, so
**no migration**: links written before the change read as "no update" until the next sync.

Update `body` is Markdown written by other people. If it's shown later, it follows
`docs/security/untrusted-content.md`. Leave it out for now.

A **detached** project is the user's own again, so it gets computed health from then on.

## 4. Where it lives

| Option                                                           | Sort/filter by health                                                                                                                           | Staleness                                                                                                                                                                                                                                                                                                                         | Cost                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. Compute on read in TypeScript** (recommended)               | Default sorts stay keyset in SQL. Health sort/filter loads every matching project plus one grouped count query, then sorts and pages in memory. | Never stale: computed per read. Only the day changing needs a refetch (section 6).                                                                                                                                                                                                                                                | No schema change. One grouped query per page.                                              |
| B. Compute in SQL (a `CASE` over a correlated aggregate)         | Sortable in SQL, but not indexable. `keyset` takes a column, so it would need an expression mode.                                               | Never stale.                                                                                                                                                                                                                                                                                                                      | The rules live twice (SQL for the value, TS for the reason) and drift apart. Hard to test. |
| C. Store `health` (+ reason) on `projects`, update it on changes | Indexed column, ordinary keyset pagination.                                                                                                     | Has to be updated on every write that affects it. Today **not every write announces one**: `SyncWriter` writes tasks without `TaskService.onChange`, `TaskChange` doesn't carry the project a task moved _out of_, and disconnects delete rows. Plus a midnight pass and one on startup, since days pass while the app is closed. | Migration, a recompute service, a scheduler, and a missed path means a wrong badge.        |

**Recommendation: A.** DevBrain is a single-user local app. A workspace has tens to a few hundred
projects, and `idx_tasks_project_id` serves the grouped count. Computing on read keeps one copy of
the rules (pure, unit-tested TS), needs no migration, and can't go stale. C's real advantage,
indexed sort by health, only matters at a scale DevBrain won't reach. It would also need the change
events fixed first.

The grouped query (`projectHealthCounts` in `health.ts`, tested against a real database):

```ts
const { startOfDay } = localDayWindow(now);
const open = sql`${tasks.status} NOT IN (${TaskStatus.COMPLETED}, ${TaskStatus.CANCELLED})`;
const overdue = sql`${open} AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${startOfDay.getTime()}`;

db.select({
  projectId: tasks.projectId,
  total: count(sql`${tasks.status} != ${TaskStatus.CANCELLED}`),
  completed: count(sql`${tasks.status} = ${TaskStatus.COMPLETED}`),
  cancelled: count(sql`${tasks.status} = ${TaskStatus.CANCELLED}`),
  overdue: count(overdue),
  overdueHigh: count(sql`${overdue} AND ${tasks.priority} = ${TaskPriority.HIGH}`),
  openWithDueDate: count(sql`${open} AND ${tasks.dueDate} IS NOT NULL`),
})
  .from(tasks)
  .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.archivedAt)))
  .groupBy(tasks.projectId)
  .all();
```

A sketch of `listProjects` with A (not built):

```ts
listProjects(filter = {}, sort = { sortBy: 'createdAt' }, page = {}, now = new Date()): Page<ProjectListItem> {
  if (sort.sortBy !== 'health' && filter.health === undefined) {
    // as today: keyset in SQL, then one grouped count for the page's ids
    const result = /* existing query */;
    return { ...result, items: this.withHealth(result.items, now) };
  }
  // health is per day, so it can't be a SQL sort key: page in memory. Every other filter still
  // runs in SQL, and the cursor keeps the same shape (sortKey 'health', last rank, last id)
  const rows = this.db.select().from(projects).where(and(...clauses)).all();
  let items = this.withHealth(rows, now);
  if (filter.health !== undefined) items = items.filter((item) => item.health.health === filter.health);
  items.sort(byHealthRank(sort.direction)); // then due date, then id
  return pageInMemory(items, page, { sortKey: 'health', sortValue: (item) => HEALTH_RANK[item.health.health] });
}

private withHealth(rows: Project[], now: Date): ProjectListItem[] {
  const counts = projectHealthCounts(this.db, rows.map((row) => row.id), now);
  return withExternalRefs(this.db, rows).map((project) => {
    const c = counts.get(project.id)!;
    const health = project.external?.state === LinkState.SYNCED
      ? healthFromLinear(/* status, dates, and health from the link's metadata */)
      : computeProjectHealth({ ...project, counts: c }, now);
    return { ...project, progress: { completed: c.completed, total: c.total }, health };
  });
}
```

Sorting by health needs its own rank. The enum's order (`OFF_TRACK=1, NOT_STARTED=2, AT_RISK=3,
ON_TRACK=4, COMPLETED=5`) puts "no update" between off track and at risk. Suggested rank, worst
first: Off track, At risk, On track, No update, Completed. A cursor from the in-memory path can go
stale when the day changes mid-scroll. The same thing happens when a write lands mid-scroll, and
the midnight refetch (section 6) starts the list over anyway.

The commented-out `progress` sort works the same way. It doesn't depend on time, but it's also not a
column, so it also takes the in-memory path.

### If you choose C anyway: the migrations, the CLAUDE.md way

1. **Add** (generated): `health integer`, `health_reason text` (JSON) and `health_day text` (the
   local day it was computed for) on `projects`, all nullable, with no CHECK. drizzle-kit emits
   plain `ALTER TABLE … ADD`, which keeps every row.
2. **Data**: none. The rules are TypeScript, so SQL can't fill the column. The recompute service
   fills every row on startup, which it has to do anyway because days pass while the app is closed.
   Until then, a null `health` reads as "no update".
3. **Constrain** (generated, from the final schema): a `CHECK (health BETWEEN 1 AND 5)` makes
   drizzle-kit rebuild the table. The columns already exist, so its copy of the rows is correct as
   generated. The `idx_projects_health_id` index (partial on `archived_at IS NULL`) needs no
   rebuild and can go in step 1 or 3.

Then run `npm run db:generate-migrations` again (it must report no changes), and test the rebuild in
`tests/db/migrations.test.ts` from a database at the migration before.

Wiring, as CLAUDE.md asks: a `ProjectHealthService` subscribes where services are built
(`Workspace`) to `TaskService`, `ProjectService` and `ArchiveService` `onChange`, and to
`integrations.onChange` for disconnects. It recomputes the affected projects and announces
`{ type: 'health_changed', projectIds }` through its own `ChangeListeners`, which the
`ChangeTracker` maps to `['project']`. First: `SyncWriter` has to announce its task writes, and
`TaskChange` has to carry the previous `projectId` on a move.

## 5. API shape

The `Project` row type stays as it is. Sync, search and favorites pass it around, and none of them
need health. Health rides on what the screens read:

```ts
// src/common (the renderer needs the enum's values): ProjectHealth moves here from core
export interface ProjectHealthResult {
  health: ProjectHealth;
  reason: HealthReason; // a discriminated union of data, worded by the renderer
  also: HealthReason[]; // the other signals, worst first
}

// listProjects' items: one call fills a card, with no stats call per project
export interface ProjectListItem extends Project {
  external: ExternalRef | null;
  progress: { completed: number; total: number }; // same shape as SubtaskProgress
  health: ProjectHealthResult;
}

// the overview already calls getProjectStats; it gains health
export interface ProjectStats {
  /* the existing counts */
  health: ProjectHealthResult;
}
```

- **Fold the stats into list items: yes**, but only `progress` (what the card shows). The full
  status breakdown stays on `getProjectStats` for the overview. The grouped query is one statement
  per page, either way.
- `HealthReason` is data (`{ code: 'overdue_tasks', count: 2, high: 1 }`), not a sentence.
  The renderer words it and can link it ("2 overdue tasks" opens the tasks tab filtered to overdue).
  `formatHealthReason` in `health.ts` is a sketch of that wording, kept there so the doc's examples
  are tested. It would move to the renderer.
- Filter and sort: `ProjectFilterOptions.health?: ProjectHealth` and `sortBy: … | 'health' |
'progress'`, as the comments in `types.ts` already plan.
- Home's project section uses the same list items.
- IPC: the handlers still return core's data as it is. `projects.list` already refetches on
  `'task'` changes (`ENTITIES_READ_BY_ROUTE`), which is what computed health needs.

## 6. Time

Health is per day, so the renderer needs exactly one refresh: **when the local day changes**. Writes
already reach it through `db.changes`.

Recommendation: a small core `DayClock` that emits `{ type: 'day_changed' }` through
`ChangeListeners`. It arms a timer for the next local midnight (`localDayWindow(now).endOfDay`) and
re-arms it after each tick. The main process also calls it on Electron's `powerMonitor` `resume`
event, since a laptop sleeps through midnight and a timer doesn't fire on time after sleep. The
`ChangeTracker` maps that event to `['project', 'task']`. Tasks need it too: "Today" and overdue
colouring move at midnight as well. The renderer invalidates as it would for any write.

Alternatives: a renderer-side timer (but then the renderer and core each decide when a day starts),
or polling (wasteful and still late). Both are worse than one event.

Inside core, each read takes `now` as a parameter with a default, so tests pin the day, as the
tests here do.

## Open questions for you

1. **Computed only, or the override too?** Recommended: computed now, override later if needed. If
   you want the override from the start, how should it end: 14 days, the next date or status change,
   or never?
2. **Thresholds.** At risk when 20+ points behind schedule or 1–2 tasks overdue. Off track when 40+
   points behind, 3+ overdue, or 2+ high-priority overdue. Stricter or looser? Should a single
   overdue high-priority task be enough for off track?
3. **On hold.** "No update" (proposed), or keep judging it, so a paused project past its due date
   still shows off track?
4. **Every task done but not marked completed, past due.** Off track (proposed, as a nudge), or
   On track?
5. **Subtasks.** Count them (proposed, matches `getProjectStats`), or only top-level tasks? Either
   way, the stats and health should agree.
6. **Naming.** Rename `ProjectHealth.NOT_STARTED` to `NO_UPDATE`, and `HealthIcon`'s `not-started`
   to match, so code and UI say the same thing?
7. **Sort/filter by health.** Do the v2 screens need it? The projects page only shows "Sort: Due
   date" and a status filter today. If not, option A needs no in-memory path at all.
8. **Linear updates.** Show only the health (proposed), or also the latest update's text and
   author?
9. **Overdue in stats.** Change `getProjectStats` to count overdue from the start of today, to match
   health and the designs?
