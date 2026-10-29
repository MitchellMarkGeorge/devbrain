# Keeping the renderer's data fresh

Research into how the renderer should learn what changed and refetch it. This covers three cases:
the user's own writes, changes nobody in the renderer asked for (sync, and work that finishes after
its call has returned), and switching workspace.

**Short answer:** main tells the renderer which **kinds of rows** changed (`task`, `note`,
`project`, …) and React Query refetches the queries on screen that read those kinds. These change
lists come from core's existing `onChange` events, collected in one place in main. A call's own
changes travel in its response (the unused `changed` field). Every other change travels as one
coalesced push event. The renderer needs a small table that says which routes read which kinds.
When a route isn't in the table, it is refetched on every change, so a route that isn't listed
still shows correct data. Estimated size: about 250 lines of code, plus tests.

**Status: implemented** in `src/main/ipc/changes.ts` (`ChangeTracker`, the sketch's `ChangeHub`)
and `src/renderer/ipc/query-invalidator.ts` (`ENTITIES_READ_BY_ROUTE`, the sketch's `READS`).
The code calls what changed **entities** (a `ChangedEntity`), where the sections below say kinds.
`docs/ipc/implementation-plan.md` describes it as built. It differs from the sketch in section 6 in
five ways:

- **Changes come only from core's services.** Procedures have no `ctx.changes` recorder. A write
  that needs to reach the renderer is announced by its service, as `WorkspaceService.create` now
  does with `created`.
- **Only mutations are tracked.** `attachRouter` hands each mutation to the tracker's
  `trackMutation()`. A query changes nothing, so it runs untracked, and anything it did change
  would be sent as a background change instead.
- **`workspace` is an entity too.** A mutation that switches workspace, or creates one, reports
  it, which refetches the workspace list. Which workspace is open comes only from
  `workspace.changed`, sent to every window, so creating a workspace doesn't wipe the cache.
- **Background changes go out once per turn of the event loop** (`setImmediate`), not every 50 ms.
  That merges the several events of one write without delaying them; sync pages are separated by
  network fetches anyway, so a longer window rarely merged two.
- **A switch uses `resetQueries`**, not `cancelQueries` plus `removeQueries`. It cancels what is in
  flight and refetches what is mounted. Removing a mounted query would leave its component showing
  nothing until it remounts.

The autosave opt-out from section 6 (a mutation that doesn't wait on refetches) is left until the
note editor needs it.

## 1. The problem

The renderer will cache query results in TanStack Query through `@trpc/tanstack-react-query`. After
a write, every cached result that the write could affect has to be refetched or dropped. Three
things make this harder than "invalidate the list you just edited":

- **Cascades.** One call can write many kinds of rows. `archive.archiveTask` archives the task's
  subtree and the notes linked to it. `detach.reattachTask` writes tasks through sync, which can also
  write projects. `integrations.disconnect` deletes or detaches mirrored tasks, projects and events.
  The route a mutation calls doesn't show what it touched. Core knows.
- **Cross-kind reads.** Many views read more than one table. The calendar view joins events to
  calendars (`listForCalendar` filters on `calendars.visible`). Favorites and the archive span
  tasks, projects, notes and events. Search spans everything, and project stats count tasks. Hiding
  a calendar changes the event list without touching an event row.
- **Writes nobody asked for.** Sync commits page after page in the background. Connecting an
  integration starts a sync run that outlives the `connect` call. Focus and resume start syncs too
  (`src/main/runtime/lifecycle.ts`).

## 2. What the code gives us

I checked each of these on `main`.

**Core already reports almost every write.** Each service has an `onChange` built on
`ChangeListeners` (`src/main/core/shared/changes.ts`):

| Source                                             | Change type                                                                        | Kinds it implies                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `TaskService`                                      | `created` / `updated` (row)                                                        | task                                     |
| `ProjectService`                                   | `created` / `updated`                                                              | project                                  |
| `NoteService`                                      | `created` / `updated` (row, maybe content)                                         | note                                     |
| `EventService`                                     | `created` / `updated` / `deleted` (ids)                                            | event                                    |
| `ArchiveService`                                   | `archived` / `restored` with `taskIds`, `projectIds`, `noteIds`                    | each non-empty one                       |
| `FavoritesService`                                 | `favorited` / `unfavorited` with `entityType`                                      | that type                                |
| `DetachService`                                    | `detached` / `reattached` with `changed: SyncEntityType[]`; `credentials_rejected` | `changed`; integration                   |
| `IntegrationService`                               | `connected`, `status_changed`, `source_changed`, `disconnected` (with `changed`)   | integration, externalSource, + `changed` |
| `SyncEngine.onProgress` (via scheduler)            | per committed page, `summary.changed: SyncEntityType[]`                            | `changed`                                |
| `SyncStateManager.onChange` (scheduler `onStatus`) | `sync_status_changed`                                                              | externalSource                           |
| `WorkspaceService.onChange`                        | `opened` / `closed`                                                                | everything                               |

Gaps:

- **`CalendarService` emits nothing.** `setSelected` and `setVisible` write rows silently, so a
  "switch a calendar on/off" would refetch nothing. It needs an `onChange` like the others (about 10
  lines, following CLAUDE.md's "Change events" rules).
- **Settings and the workspace registry** (`settings.update`, `workspaces.create/delete`) emit no
  events. They aren't workspace rows. The call's own response can cover them, and the
  `ctx.changes.record()` recorder in `src/main/ipc/context.ts` already exists for exactly this.

Sync's own row writes (`SyncWriter`) skip the services' events but are summarised per page in
`SyncProgress.summary.changed`, which is enough.

**IPC is already shaped for this.**

- `IpcResult` (`src/common/ipc/types.ts`) carries `changed: ChangedEntity[]` on success and failure.
  `attachRouter` (`src/main/ipc/server.ts`) fills it from a per-call recorder that nothing calls
  yet.
- `ipcLink` (`src/renderer/ipc/link.ts`) already has an `onChanged` hook. It **awaits** that hook
  before settling the call, so a mutation can resolve only after its views have refetched.
- `AppEvents` (`src/common/events.ts`) already declares `db.changes`, `sync.progress`,
  `integrations.changed`, `sources.changed` and `workspace.changed`. The preload bridge subscribes to
  them, but nothing sends them yet.
- `ChangedEntity` (`src/common/changes.ts`) is the 7-kind vocabulary: task, note, project, event,
  calendar, integration, externalSource.

**better-sqlite3 has no change hooks.** In v12.11.1 (installed), `Database.prototype` has only
`prepare transaction pragma backup serialize function aggregate table loadExtension exec close
defaultSafeIntegers unsafeMode`. There is no `update_hook` or `commit_hook` (confirmed against
[its API docs][bs3-api]). SQLite's own [`sqlite3_update_hook`][update-hook] only sees its own
connection and skips WITHOUT ROWID tables anyway. Change capture at the SQLite level would need
triggers writing to a log table, which the core events already make unnecessary.

**Everything runs on one synchronous connection in main.** Most write paths are synchronous. Only
note files (`createNote`, `updateNoteContent`), provider calls (`reattachTask`, connect) and
workspace open/close are async.

## 3. Measurements

### Query cost

I seeded a workspace with `npm run seed:dev -- --path=<scratch>` (382 tasks, 143 notes, 116 events,
14 projects). Then I grew a copy by 10,000 tasks (13,717 tasks, 2,143 notes, 2,616 events, ~1,600 of
them in the current month). I timed core calls directly in Node with better-sqlite3, 200 runs each,
warm. "Serialize" is `v8.serialize` of the result, which stands in for the structured clone that
Electron IPC does.

| Query                              | Seed p50 | Large p50  | Large p95 | Large serialize | Large size |
| ---------------------------------- | -------- | ---------- | --------- | --------------- | ---------- |
| `tasks.listTasks` page of 50       | 0.69 ms  | 0.70 ms    | 1.2 ms    | 0.08 ms         | 18 KB      |
| `tasks.listTasks` page of 200      | 1.5 ms   | 1.5 ms     | 3.0 ms    | 0.24 ms         | 73 KB      |
| `tasks.listTasks` by project, 50   | 0.48 ms  | 1.8 ms     | 3.4 ms    | 0.05 ms         | 18 KB      |
| `projects.listProjects` 50         | 0.54 ms  | 0.32 ms    | 0.45 ms   | 0.02 ms         | 4.5 KB     |
| `projects.getProjectStats`         | 0.48 ms  | 0.98 ms    | 1.2 ms    | —               | 0.1 KB     |
| `notes.listNotes` 50               | 0.33 ms  | 0.28 ms    | 0.40 ms   | 0.04 ms         | 21 KB      |
| `favorites.listFavorites` 50       | 0.44 ms  | 0.58 ms    | 0.72 ms   | 0.02 ms         | 7 KB       |
| `archive.listArchived` 50          | 0.26 ms  | 0.26 ms    | 0.36 ms   | —               | —          |
| `calendars.list`                   | 0.11 ms  | 0.13 ms    | 0.23 ms   | —               | 0.2 KB     |
| `search.search` 20–50 hits         | 0.1 ms   | 8.0–8.2 ms | 10–15 ms  | 0.02 ms         | 3–8 KB     |
| `events.listForCalendar` (a month) | 0.90 ms  | **14 ms**  | 23 ms     | 2.2 ms          | **521 KB** |
| six task/project views together    | 2.6 ms   | 4.6 ms     | 6.5 ms    |                 |            |
| write: `tasks.updateTask`          | 0.71 ms  | 3.2 ms     | 3.5 ms    |                 |            |
| write: archive + restore a subtree | 3.1 ms   | 8.2 ms     | 10 ms     |                 |            |

What this means:

- A page of a list costs about **1 ms** in main. Refetching every query a typical screen shows
  (3–8 queries) costs a few milliseconds. That is about what the write itself costs.
- Two queries are expensive: a **busy month of calendar** (14 ms, 0.5 MB to clone) and **search**
  on a large workspace (8 ms). These are worth not refetching on unrelated changes, which is why
  kinds beat "refetch everything" (option B below).
- Queries run synchronously on main's event loop, so a refetch burst briefly delays other main work,
  including sync. At these sizes, the delay is a few milliseconds.

### IPC round trip and ordering

I built a throwaway Electron 42.4.1 app (sandboxed preload, `contextIsolation`, run under xvfb):

- `ipcRenderer.invoke` round trip with a trivial handler: **0.2 ms p50, 0.3 ms p95.**
- Ordering between a handler's `webContents.send` and its own `invoke` reply, 3,000 calls per mode,
  two runs:
  - `send` then return (sync, after `await`, via `event.sender`, or with a 1 MB reply): the
    event arrived before the reply every time, **except the very first message of the session**,
    where the reply won in both runs.
  - `send` scheduled after the reply (`setImmediate`): the reply usually won (468 of 500), but not
    always.

So the ordering usually holds but isn't guaranteed. The invoke reply and `webContents.send` go
through different Mojo interfaces, and [Electron's IPC docs][electron-ipc] promise nothing about
their relative order. **The design below doesn't depend on it.** A call's own changes travel in
its own reply, and everything else is an independent push, where a duplicate is harmless.

## 4. Approaches surveyed

### A. Each mutation invalidates by hand (the React Query default)

React Query does not link mutations to queries. The docs tell you to call `invalidateQueries` in a
mutation's `onSuccess` ([TanStack: invalidations from mutations][tq-inv-mut]). tRPC's React Query
integration provides typed `pathFilter()`/`queryFilter()` for this
([tRPC TanStack usage][trpc-tq]).

- The renderer must know every cascade. Archiving a task must also invalidate notes, favorites,
  search, project stats and the archive. When core changes, these lists silently go stale.
- It doesn't cover sync at all.
- Verdict: fine for a CRUD web app, wrong here, because core already knows the answer.

### B. Invalidate everything after any mutation

TkDodo's ["Automatic Query Invalidation after Mutations"][tkdodo-auto] puts one
`MutationCache.onSuccess` that invalidates all queries (only active ones refetch), optionally
narrowed by `meta` tags.

- Simplest of all, and correct for the user's own writes, cascades included.
- It still needs a signal for sync and late work.
- Every write refetches every visible query, including the 14 ms calendar month and search. That
  hurts most during sync, which commits many pages.
- Verdict: a good fallback rule for routes we haven't classified, but not the whole answer.

### C. Tags/kinds: the server reports what changed, the client maps it to queries

[RTK Query's tags][rtk-tags]: queries `provide` tags, mutations `invalidate` tags, and matching
cached queries refetch if something is subscribed. TkDodo's
["Using WebSockets with React Query"][tkdodo-ws] applies the same idea to server pushes. The
server sends small "entity X changed" events, not data, and the client turns them into
`invalidateQueries` calls. He argues invalidation is simpler than pushing data, and doesn't send
data to queries nobody is using.

- Here the "tags" come from core's events, so cascades and sync are covered by construction.
- Our kinds are the 7 `ChangedEntity` values. A small table says which routes read which kinds.
- Verdict: **recommended** (section 6).

### D. Normalized cache / object pool (Apollo, Relay, Linear)

Apollo and Relay store entities by id, so a mutation that returns an updated row updates it
everywhere. They can't know list membership: adding or removing items from a list needs a manual
`update` function or `refetchQueries` ([Vue Apollo docs][apollo-mut]).

[Linear's sync engine][linear-scaling] keeps an in-memory object pool of MobX-observable models,
loaded from IndexedDB, and applies server "delta packets" to it
([reverse-engineered write-up][linear-reverse]). Views are computed from the pool, so they update
themselves.

- Correct and fast, but it means the renderer owns a model of the data and the query logic: filters,
  sorting, keyset paging, FTS search. All of that lives in core today. We would write it twice.
- Verdict: too much for a local app whose "server" is ~0.2 ms away.

### E. Live queries: main re-runs subscribed queries and pushes results

This is how local-SQLite reactive libraries work. [PowerSync's watched queries][powersync-watch]
re-run a query when a table it reads changes, with a `throttleMs`. Dart's `sqlite_async` finds the
tables with `EXPLAIN QUERY PLAN` and throttles at 30 ms by default ([sqlite_async watch][sqlite-async]).
vlcn's [`rx-tbl`][vlcn-rx] notifies at table level for cr-sqlite, and React bindings re-run
queries from it. [Zero][zero-zql] goes further, with incrementally maintained views.

- Table-level granularity, our "kinds", is what these libraries settled on as good enough.
- For us it would mean subscriptions over IPC (tRPC subscriptions, which our transport deliberately
  doesn't carry), and main tracking each window's live queries and inputs. It duplicates what React
  Query already does on the renderer side: knowing what is mounted, deduping, retrying, garbage
  collecting.
- Verdict: same granularity as C, more machinery. C gets the same result with the cache we already
  plan to use.

### F. Change capture at the SQLite level

- `sqlite3_update_hook` / `commit_hook`: not exposed by better-sqlite3 (section 2). The
  workaround people suggest is triggers ([cr-sqlite discussion][crsqlite-bs3]).
- Triggers into a change-log table: catches every write, including ones that bypass services.
  However, it adds a write per row to every statement, needs migrations, and still has to be mapped
  back to kinds.
- [`PRAGMA data_version`][data-version] only detects commits from _other_ connections. We have one.
- Verdict: not needed. Core's events are already this signal, at the right level of meaning
  (an archive cascade arrives as one event, not N row writes).

### G. A full sync engine (Replicache, Zero)

[Replicache][replicache-how] runs mutators against a local store, subscriptions re-fire when their
results change, and a data-free ["poke"][replicache-poke] tells clients to pull. The poke idea is
worth borrowing: our push event is a poke that carries kinds.

- Built for client-server sync with a remote source of truth. Our source of truth is already local.
- Verdict: out of scope. The poke-and-pull shape is what C does.

## 5. Comparison

|                                     | A. Manual                  | B. Invalidate all  | **C. Kinds from core**                            | D. Normalized       | E. Live queries           | F. SQLite capture   |
| ----------------------------------- | -------------------------- | ------------------ | ------------------------------------------------- | ------------------- | ------------------------- | ------------------- |
| Cascades covered                    | by hand                    | yes                | **yes (core reports them)**                       | rows yes, lists no  | yes                       | yes                 |
| Sync / late work                    | no                         | needs a push       | **yes**                                           | yes                 | yes                       | yes                 |
| Cross-kind reads (calendar ↔ event) | by hand                    | yes                | **via reads table**                               | by hand             | yes                       | yes                 |
| New concepts                        | none                       | none               | **kinds, reads table**                            | entity store        | subscriptions             | log table, triggers |
| What a new route needs              | invalidation code          | nothing            | **nothing to be correct; a line to be efficient** | normalization rules | a subscription            | nothing             |
| Refetch cost per write              | minimal                    | all active queries | **active queries reading the kind**               | none                | queries reading the table | as C                |
| Mutation can await fresh views      | yes                        | yes                | **yes (link already awaits)**                     | n/a                 | no                        | depends             |
| Second window                       | no                         | needs a push       | **same push**                                     | yes                 | yes                       | yes                 |
| Rough size                          | spread over every mutation | ~30 lines          | **~250 lines**                                    | thousands           | ~600+                     | ~300 + migrations   |

## 6. Recommendation

**Kinds from core, delivered in the call's response for its own changes and as a coalesced push for
everything else. React Query refetches the active queries that read those kinds.**

### Main process: one `ChangeHub`

A new file, `src/main/ipc/changes.ts` (~150 lines with the mapping). It is built once in
`src/main/index.ts`, next to `attachRouter`.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChangedEntity } from '@common/changes';

interface CallScope {
  changed: Set<ChangedEntity>;
  done: boolean;
}

export class ChangeHub {
  private readonly calls = new AsyncLocalStorage<CallScope>();
  private readonly pending = new Set<ChangedEntity>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly push: <K extends AppEventName>(name: K, payload: AppEvents[K]) => void,
  ) {}

  // Subscribes to the open workspace's services, and moves to the next one on a switch.
  watch(devBrain: DevBrain): void {
    let detach = devBrain.currentWorkspace ? this.attach(devBrain.currentWorkspace) : () => {};
    devBrain.workspaces.onChange((change) => {
      detach();
      detach = change.type === 'opened' ? this.attach(change.workspace) : () => {};
      this.push('workspace.changed', {
        id: change.type === 'opened' ? change.workspace.info.id : null,
      });
    });
  }

  private attach(ws: Workspace): () => void {
    const off = [
      ws.tasks.onChange(() => this.record('task')),
      ws.projects.onChange(() => this.record('project')),
      ws.notes.onChange(() => this.record('note')),
      ws.events.onChange(() => this.record('event')),
      ws.calendars.onChange(() => this.record('calendar')), // new: see section 2
      ws.archive.onChange((c) => this.record(...archiveKinds(c))),
      ws.favorites.onChange((c) => this.record(FAVORITE_KIND[c.entityType])),
      ws.detach.onChange((c) => this.record(...detachKinds(c))),
      ws.integrations.onChange((c) => this.record(...integrationKinds(c))),
      ws.sync.onProgress((p) => this.record(...p.summary.changed)),
      ws.sync.onStatus(() => this.record('externalSource')),
    ];
    return () => off.forEach((f) => f());
  }

  // Runs one IPC call; what it changes comes back with it.
  async runCall<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: PromiseSettledResult<T>; changed: ChangedEntity[] }> {
    const scope: CallScope = { changed: new Set(), done: false };
    try {
      const result = await this.calls.run(scope, () =>
        fn().then(
          (value) => ({ status: 'fulfilled', value }) as const,
          (reason) => ({ status: 'rejected', reason }) as const,
        ),
      );
      return { result, changed: [...scope.changed] };
    } finally {
      scope.done = true; // later work started by the call (a sync run) pushes instead
    }
  }

  record(...kinds: ChangedEntity[]): void {
    const scope = this.calls.getStore();
    if (scope && !scope.done) {
      kinds.forEach((k) => scope.changed.add(k));
      return;
    }
    kinds.forEach((k) => this.pending.add(k));
    this.flushTimer ??= setTimeout(() => this.flush(), 50); // coalesce a sync burst
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pending.size === 0) return;
    this.push('db.changes', { entities: [...this.pending] });
    this.pending.clear();
  }
}
```

In `attachRouter`, wrap the `callTRPCProcedure` call in `hub.runCall(...)` and merge its `changed`
with the existing recorder's. `ctx.changes.record` stays as the escape hatch for writes core
doesn't announce (settings). `push` is
`BrowserWindow.getAllWindows().forEach(w => w.webContents.send(IPC_EVENT_PREFIX + name, payload))`.

Why `AsyncLocalStorage` ([Node docs][node-als]): most calls are synchronous, so their events fire
inside the call anyway. A few calls (`updateNoteContent`, `reattachTask`, `connect`, `open`) emit
after an `await`, and a sync timer can fire while they wait. The async context keeps each event
with the call that caused it. The `done` flag handles the one trap. A sync run that a call _starts_
(connect → scheduler) inherits the call's context, so once the call has returned, its later pages
go out as pushes instead of into a reply already sent.

Mapping notes:

- `archiveKinds` gives `task`/`project`/`note` for each non-empty id list.
- `detachKinds` gives `changed` for detached/reattached and `integration` for
  `credentials_rejected`.
- `integrationKinds` gives `integration` + `externalSource`, plus `changed` on `disconnected`.
- Over-reporting only costs a refetch, so when a mapping is in doubt, report more kinds.

Which of the declared events (`sync.progress`, `integrations.changed`, `sources.changed`) to keep
is a UI question, for showing progress and status. Freshness needs only `db.changes` and
`workspace.changed`.

### Renderer: one invalidate function, one reads table

About 80 lines in `src/renderer/ipc/`:

```ts
// Which kinds each router's queries read. A router not listed is refetched on any change: correct
// by default, and a line here makes it cheaper.
const READS: Record<string, readonly ChangedEntity[]> = {
  tasks: ['task', 'project'], // task rows show their project
  projects: ['project', 'task'], // stats count tasks
  notes: ['note', 'task', 'project'],
  events: ['event', 'calendar'], // listForCalendar filters on calendars.visible
  calendars: ['calendar'],
  favorites: ['task', 'project', 'note', 'event'],
  archive: ['task', 'project', 'note'],
  search: ['task', 'project', 'note', 'event'],
  integrations: ['integration', 'externalSource'],
  app: [],
  workspaces: [],
  settings: [], // not workspace rows
};
// a full path overrides its router, e.g. 'notes.getContent': ['note']

function readsOf(query: Query): readonly ChangedEntity[] | 'all' {
  const [path] = query.queryKey as [string[]]; // tRPC keys start with the path
  return READS[path.join('.')] ?? READS[path[0]] ?? 'all';
}

export function invalidate(kinds: readonly ChangedEntity[]): Promise<void> {
  if (kinds.length === 0) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: (q) => {
      const r = readsOf(q);
      return r === 'all' || r.some((k) => kinds.includes(k));
    },
  });
}

export const ipc = createTRPCClient<AppRouter>({ links: [ipcLink({ onChanged: invalidate })] });

events.on('db.changes', ({ entities }) => void invalidate(entities));
events.on('workspace.changed', async () => {
  const scoped = {
    predicate: (q: Query) => !['app', 'workspaces', 'settings'].includes(pathOf(q)[0]),
  };
  await queryClient.cancelQueries(scoped); // drop the old workspace's in-flight results
  queryClient.removeQueries(scoped); // mounted queries fetch again from the new one
});
```

`invalidateQueries` marks every match stale, but by default refetches only **active** (mounted)
ones. Its promise resolves when those refetches finish, and it cancels a running fetch first
(`cancelRefetch: true`), per `@tanstack/query-core` 5.105 `queryClient.ts`. Because `ipcLink`
awaits `onChanged`, `mutateAsync` resolves **after** the visible views show the new data. No
flicker, and a "Saving…" state covers the refetch.

### How each situation plays out

1. **Archive a task.** `ArchiveService` emits `archived` with task and note ids inside its
   transaction. The hub puts `task` and `note` in the call's scope, and the reply carries
   `changed: ['task', 'note']`. The renderer refetches visible task, note, project, favorites,
   archive and search queries, then the mutation resolves.
2. **Hide a calendar.** Once `CalendarService` emits, the reply carries `calendar`, and the
   calendar view refetches because `events` reads `calendar`.
3. **Disconnect.** `disconnected` carries `changed`, so the reply covers tasks, projects and events.
4. **Background sync.** Each committed page adds its `summary.changed` to `pending`. At most one
   `db.changes` per 50 ms reaches the renderer. With the measured costs, that is a few ms of
   refetch per push even on a large workspace.
5. **Connect, then the first sync.** The `connect` reply carries `integration`/`externalSource`.
   The run it started sends its pages as pushes after the call is done.
6. **Switch workspace.** `opened`/`closed` re-points the hub's subscriptions and pushes
   `workspace.changed`. The renderer cancels and removes workspace queries, and the mounted ones
   load from the new workspace. Requests sent after the event arrive in main after the switch,
   because main handles calls in order.

### Other points

- **Optimistic updates** stay optional and local to a mutation (`onMutate` + `setQueryData`). The
  invalidation that follows replaces the guess with the truth, so no `onSettled` refetch is needed.
- **Infinite lists.** Invalidation refetches every loaded page, one after another, starting from
  the first ([TanStack: infinite queries][tq-infinite]). Our keyset cursors survive rows moving.
  At ~1 ms a page this is fine for a few pages. Set `maxPages` (e.g. 5) on long lists to cap it.
- **Note autosave.** Each `updateNoteContent` reports `note`, which refetches note lists. That is
  cheap and correct, since the preview and `updatedAt` changed. The open editor must not be
  overwritten by its own refetch: it should treat the content query as its initial value only
  (`staleTime: Infinity`, or `notes.getContent: []` in `READS`). The editor should also debounce
  saves (~500 ms). An autosave shouldn't wait on refetches. Allow the call to opt out of awaiting
  through tRPC's `op.context`, which `ipcLink` can read (a few lines).
- **A second window.** The hub already pushes to every window. The only addition is to broadcast a
  call's `changed` as `db.changes` to the _other_ windows (send to all but `event.sender`). The
  open workspace is global to main, so `workspace.changed` already reaches every window.

### Size

| Piece                                                            | Lines |
| ---------------------------------------------------------------- | ----- |
| `ChangeHub` + kind mapping (main)                                | ~150  |
| `attachRouter` / `index.ts` wiring                               | ~20   |
| `CalendarService.onChange`                                       | ~10   |
| Renderer `READS`, `invalidate`, event wiring, query client       | ~80   |
| Tests (hub attribution and coalescing; link awaits; reads table) | ~200  |

A new route needs nothing to stay fresh: it gets refetched on every change. A new route that reads
one kind needs one line in `READS`. A new core write needs an `onChange` event, which CLAUDE.md
already requires.

## 7. Risks and open questions

- **A first load in flight when a change lands.** If a query has no data yet, `invalidateQueries`
  reuses the in-flight fetch instead of cancelling it. If that fetch ran in main _before_ the
  change, the view stays stale until the next change. Main runs calls in order, and replies came
  before later pushes in the ordering test, so the window is tiny. It isn't zero, though, especially
  for async reads (note files) and the first message of a session. Cheap hardening: the hub keeps a
  counter of changes and stamps every reply and push with it. The link invalidates again when a
  query reply is older than the last change seen (~15 lines). Worth doing if this is ever observed.
- **A missing `onChange`.** If a core write doesn't announce itself, its views go stale. The
  calendar gap shows this happens. Mitigation: a test that runs each mutation route and checks the
  reply's `changed` is non-empty, plus the CLAUDE.md rule.
- **Kinds are coarse.** Editing one task refetches every visible task query, not just that task's
  detail. The measurements say this costs about a millisecond per query. If it ever matters, events
  can carry ids and the reads table can match `getById` inputs. That is an additive change.
- **Heavy queries.** The busy calendar month (14 ms, 0.5 MB) refetches on every `event` or
  `calendar` change, including each sync page with events. The 50 ms coalescing bounds it. If it
  shows up in profiles, raise the push interval during an initial sync, or narrow the calendar's
  range.
- **Sync status UI.** Showing progress needs `sync.progress`/`sources.changed` as data events,
  separate from queryInvalidator. Decide when the UI exists.
- **Settings.** No kind covers them. The `settings.update` mutation can `setQueryData` from its
  return value. Add a `settings` kind only if a second window needs it.
- **`AsyncLocalStorage` in Electron's main.** It is standard Node and stable, but attribution
  depends on context being propagated. Callbacks queued through a native API that drops async
  context would land in "push" rather than "call". That is still correct, just not awaited by the
  mutation. Cover the async routes in tests.

## Sources

- [better-sqlite3 API docs][bs3-api]; [SQLite `sqlite3_update_hook`][update-hook];
  [SQLite `PRAGMA data_version`][data-version];
  [cr-sqlite discussion on better-sqlite3 and update hooks][crsqlite-bs3]
- [TanStack Query: invalidations from mutations][tq-inv-mut];
  [TanStack Query: infinite queries][tq-infinite]; `@tanstack/query-core` 5.105.0 source,
  `queryClient.ts` (`invalidateQueries`, `refetchQueries`) and `query.ts` (`fetch`, `cancelRefetch`)
- [TkDodo: Automatic Query Invalidation after Mutations][tkdodo-auto];
  [TkDodo: Using WebSockets with React Query][tkdodo-ws]
- [tRPC: TanStack React Query usage][trpc-tq]
- [RTK Query: automated re-fetching][rtk-tags]; [Vue Apollo: mutations and the cache][apollo-mut]
- [Linear: scaling the Linear sync engine][linear-scaling];
  [reverse-engineered Linear sync engine][linear-reverse]
- [Replicache: how it works][replicache-how]; [Replicache: poke][replicache-poke];
  [Zero: ZQL fundamentals (preview docs)][zero-zql]
- [PowerSync React SDK: watched queries][powersync-watch]; [Dart sqlite_async `watch`][sqlite-async];
  [vlcn rx-tbl reactivity][vlcn-rx]
- [Electron: inter-process communication][electron-ipc]; [Node: AsyncLocalStorage][node-als]
- Measurements: the seed script in this repo, a throwaway benchmark of core calls, and a throwaway
  Electron 42.4.1 ordering test, all kept outside the repository.

[bs3-api]: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
[update-hook]: https://www.sqlite.org/c3ref/update_hook.html
[data-version]: https://www.sqlite.org/pragma.html#pragma_data_version
[crsqlite-bs3]: https://github.com/vlcn-io/cr-sqlite/discussions/424
[tq-inv-mut]: https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations
[tq-infinite]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/infinite-queries.md
[tkdodo-auto]: https://tkdodo.eu/automatic-query-invalidation-after-mutations
[tkdodo-ws]: https://tkdodo.eu/blog/using-web-sockets-with-react-query
[trpc-tq]: https://trpc.io/docs/client/tanstack-react-query/usage
[rtk-tags]: https://redux-toolkit.js.org/rtk-query/usage/automated-refetching
[apollo-mut]: https://v4.apollo.vuejs.org/api/apollo-mutation
[linear-scaling]: https://linear.app/blog/scaling-the-linear-sync-engine
[linear-reverse]: https://github.com/wzhudev/reverse-linear-sync-engine
[replicache-how]: https://doc.replicache.dev/concepts/how-it-works
[replicache-poke]: https://doc.replicache.dev/byob/poke
[zero-zql]: https://zero-docs-lg7nd2c7k-rocicorp.vercel.app/docs/zql-fundamentals
[powersync-watch]: https://powersync-ja.github.io/powersync-js/react-sdk/globals
[sqlite-async]: https://pub.dev/documentation/powersync/1.18.0/sqlite_async/SqliteQueries/watch.html
[vlcn-rx]: https://vlcn.io/docs/cr-sqlite/js/reactivity
[electron-ipc]: https://www.electronjs.org/docs/latest/tutorial/ipc
[node-als]: https://nodejs.org/api/async_context.html#class-asynclocalstorage
