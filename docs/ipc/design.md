# Typed IPC layer: design

How the renderer reaches core, and how it stays current when core changes data. This is the
reference for the layer as built. The plan it was built from, with notes on what changed along the
way, is [implementation-plan.md](implementation-plan.md); why the renderer stays fresh the way it
does is [change-propagation-research.md](change-propagation-research.md).

The layer is a thin shell. Handlers call core's services and return what they return. Core's own
`onChange` events say what changed, and main turns them into the kinds of rows the renderer
refetches.

## The pieces

| Process  | Files                                                                                  | Role                                                                  |
| -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| shared   | [`src/common/ipc`](../../src/common/ipc)                                               | Channel names, `IpcRequest`, `IpcResult`, `IpcErrorCode`, `IpcBridge` |
| shared   | [`src/common/changes.ts`](../../src/common/changes.ts)                                 | `ChangedEntity`, the kinds of rows a change is reported as            |
| shared   | [`src/common/events.ts`](../../src/common/events.ts)                                   | `AppEvents`, the push events main sends                               |
| main     | [`src/main/ipc/router.ts`](../../src/main/ipc/router.ts)                               | `appRouter` and its type `AppRouter`, built from `routers/`           |
| main     | [`src/main/ipc/server.ts`](../../src/main/ipc/server.ts)                               | `attachRouter`: the transport over `ipcMain`                          |
| main     | [`src/main/ipc/changes.ts`](../../src/main/ipc/changes.ts)                             | `ChangeTracker`: core's changes to `changed` and push events          |
| preload  | [`src/preload/index.ts`](../../src/preload/index.ts)                                   | A generic bridge, `window.ipcBridge`, with nothing in it per route    |
| renderer | [`src/renderer/ipc/link.ts`](../../src/renderer/ipc/link.ts)                           | `ipcLink`, tRPC's transport over the bridge                           |
| renderer | [`src/renderer/ipc/query-invalidator.ts`](../../src/renderer/ipc/query-invalidator.ts) | `ENTITIES_READ_BY_ROUTE` and the invalidation it drives               |
| renderer | [`src/renderer/ipc/index.ts`](../../src/renderer/ipc/index.ts)                         | `queryClient`, `ipc`, `trpc`, `events`, `queryInvalidator`            |

The renderer imports `AppRouter` as a type only, so the client is typed from the router without
bundling any of main. An ESLint rule rejects a value import from `src/main` in the renderer.
Anything the renderer needs at runtime (enums, error codes, schemas) lives in `src/common`.

## How a call travels

```
renderer                      preload                main                               core
trpc.tasks.updateStatus  ──►  ipcBridge.invoke  ──►  'ipc:call' handler (attachRouter)
  → ipcLink                   { path, type, input }    createContext
                                                       mutation → ChangeTracker.trackMutation
                                                         tRPC: input schema → middleware
                                                           → resolver                    ──►  TaskService.updateStatus
                                                                                              emits { type: 'updated' }
                                                         tracker hears it → ['task']   ◄──
ipcLink ◄────────────────────────────────────────────  { ok, data, changed: ['task'] }
  queryInvalidator.onChanged(['task'])  → refetch mounted queries
  → the call resolves
```

1. **Renderer.** A component calls through `trpc` (React Query's options) or `ipc` (the plain
   client). [`ipcLink`](../../src/renderer/ipc/link.ts) sends `{ path, type, input }` through the
   bridge. Subscriptions are refused: they don't run over IPC.
2. **Preload.** [`createBridge`](../../src/preload/index.ts) forwards the request with
   `ipcRenderer.invoke` on `ipc:call`. It checks nothing; main trusts nothing from the renderer.
3. **Main.** [`attachRouter`](../../src/main/ipc/server.ts) registers the one `ipc:call` handler.
   It refuses anything but a query or a mutation, builds the call's context, and runs the
   procedure with tRPC's `callTRPCProcedure`, which finds the path, validates the input and runs
   the middleware and the resolver. An unknown path, or a type that isn't the procedure's, fails.
   A mutation runs inside the `ChangeTracker` (see below); a query runs untracked.
4. **Core.** The resolver calls a service on `ctx.workspace` or `ctx.devBrain` and returns what it
   returns. Database calls are synchronous, so most resolvers are one line with no `await`.
5. **Back.** Main answers with an `IpcResult`. The link hands `changed` to
   `queryInvalidator.onChanged`, waits for the mounted queries reading those entities to refetch,
   and only then resolves the call or throws. So a mutation's caller never sees stale data after it
   settles.

The context ([`context.ts`](../../src/main/ipc/context.ts)) is built fresh for every call:
`{ event, devBrain, workspace, log }`. `workspace` is whichever workspace is open when the call
arrives. [`src/main/index.ts`](../../src/main/index.ts) loads DevBrain and attaches the router
and the tracker before it creates the window, so a call never arrives before DevBrain is ready. No
workspace is open yet: the renderer's first call, `workspaces.openLast`, reopens the last one.

### The envelope and errors

Every call answers with an `IpcResult` ([`types.ts`](../../src/common/ipc/types.ts)):

```ts
{ ok: true; data: T; changed: ChangedEntity[] }
{ ok: false; error: IpcErrorShape; changed: ChangedEntity[] }
```

`changed` is filled on failure too: a mutation that committed one write and then threw still
reports it, so the renderer refetches whatever did commit.

A failure reaches the renderer as a `TRPCClientError` whose `data` is a `SerializedError`:
`{ code, message, data }`. Switch on `err.data.code`, typed as `IpcErrorCode`:

- **Core's codes** (`CoreErrorCode` in [`src/common/errors.ts`](../../src/common/errors.ts)):
  `not_found`, `external_read_only`, `rate_limited`, `cancelled`, and the rest. A `CoreError`
  keeps its message, and its own fields go into `data` (a `RateLimitError`'s `retryAt`, an
  `IntegrationAlreadyConnectedError`'s `integrationId`).
- **`invalid_input`** for an input that fails its schema, with the issues (`message`, `path`) in
  `data`. It is core's code, so the renderer handles both sources the same way.
- **The layer's own codes:** `no_workspace_open` (the route needs a workspace and none is open)
  and `devbrain_unavailable` (DevBrain could not be loaded).
- **`internal`** for anything else, including an unknown path or a malformed request. Its message
  is always "Something went wrong": the original may name files or SQL. Main logs the original.

[`serializeError`](../../src/main/ipc/errors.ts) makes this choice, and the router's
`errorFormatter` ([`trpc.ts`](../../src/main/ipc/trpc.ts)) puts the result in tRPC's error shape.
Each failure is logged once, by the `onError` that `src/main/index.ts` passes to `attachRouter`:
a warning with the code for an expected one, an error with the original for `internal`.

## Base procedures and middleware

Routes never use `t.procedure`. They start from one of three base procedures
([`procedures.ts`](../../src/main/ipc/procedures.ts)), each usable for a query or a mutation:

| Procedure           | Middleware ([`middleware.ts`](../../src/main/ipc/middleware.ts)) | Context it guarantees           | Used by                                  |
| ------------------- | ---------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| `publicProcedure`   | `logging`                                                        | nothing                         | `app`                                    |
| `devBrainProcedure` | `logging`, `requireDevBrain`                                     | `ctx.devBrain`                  | `workspaces`, `settings`                 |
| `wsProcedure`       | `logging`, `requireWorkspace`                                    | `ctx.devBrain`, `ctx.workspace` | every route on the open workspace's data |

- `logging` writes each call's type, path and duration at debug level, never its input (which can
  be a note's content or an API key).
- `requireDevBrain` fails with `devbrain_unavailable`; `requireWorkspace` with that or
  `no_workspace_open`. Each narrows the context type, so a resolver reads `ctx.workspace` without
  a null check.

Shared input schemas are in [`zod.ts`](../../src/main/ipc/zod.ts): `zId(entity)` checks an id's
prefix and gives the resolver a branded id; `zPage` and `zPageFields` are core's page options, with
`cursor` at the top of the input as `infiniteQueryOptions` expects. Routes reuse core's own schemas
where they exist (`appSettingsSchema`, `safeUrlSchema`, `hexColorSchema`, `timeZoneSchema`).

There is no sender check: the window is sandboxed, denies new windows and cancels navigation
(`hardenWindow` in `src/main/index.ts`), so only the app's own page can call main.

## The routers

[`router.ts`](../../src/main/ipc/router.ts) merges one router per feature, in
[`src/main/ipc/routers`](../../src/main/ipc/routers): `app`, `workspaces`, `workspace`, `settings`,
`tasks`, `archive`, `calendars`, `integrations`, `sources`, `sync`, `notes`, `projects`, `events`,
`favorites`, `recents` and `search`. Each file's comments say what its procedures do. A few points that are
not obvious from one file:

- **`setFavorite`** (tasks, projects, notes, events) takes the state wanted, not a toggle, so a
  double click or a stale view can't flip it back. Core's favorite methods are idempotent and emit
  nothing for a repeat, which returns `changed: []`.
- **`favorites.list`** and **`recents.list`** return each entry's whole entity under `entity`, as
  its own router's `get` would, narrowed by `entityType`: what a row draws (a task's status, a
  project's colour, an event's colour and calendar) is all there. Core picks the page in one query
  and reads each entity type on it in one batched lookup, so a longer page costs no more queries.
- **`recents.recordView`** takes any task, project, note or event id and stamps it as viewed now;
  the renderer calls it when a page for one opens. It reports `changed: ['recent']`, never the
  entity's own kind, so a view refetches the recents list and not every list of that entity.
- **`workspaces`** returns `WorkspaceInfo`, never a `Workspace`. `create` doesn't open the new
  workspace; `open` closes the open one first and remembers the new one for the next launch.
  `openLast` is the renderer's first call: it opens the workspace open last time while none is
  open, and otherwise returns the one already open, so a reload never reopens it.
- **Long-running mutations.** `integrations.connect` with OAuth resolves when the browser flow ends;
  `integrations.cancelConnect` aborts it, and the waiting call fails with `cancelled`. `sync.now`
  resolves once its runs have ended, so what they wrote comes back in its `changed`.
- **Work left running.** The first sync after `integrations.connect`, `sources.setEnabled` or
  `calendars.setSelected` goes on after the response. What it writes reaches the renderer as
  `db.changes`.
- **`search.search`** returns the only HTML core produces: escaped text with matches in `<b>`
  (see [untrusted-content.md](../security/untrusted-content.md)).

## How changes reach the renderer

### The ChangeTracker

[`ChangeTracker`](../../src/main/ipc/changes.ts) listens to every service of the open workspace
that changes rows (`tasks`, `projects`, `notes`, `events`, `calendars`, `archive`, `favorites`,
`recents`, `detach`, `integrations`, and the sync scheduler's `onProgress` and `onStatus`), and to
`devBrain.workspaces.onChange`. It maps each change to `ChangedEntity[]` and decides where those go:

```
            a core service emits a change
                        │
                        ▼
          mapped to ChangedEntity[] (task, note, …)
                        │
      emitted while a mutation runs and hasn't answered?
          │ yes                               │ no
          ▼                                   ▼
  into that mutation's `changed`;      into this turn's background batch;
  once it answers, to the other        one `db.changes` to every window
  windows as `db.changes`              when the event-loop turn ends
```

The rules that shape it:

- **Only mutations are tracked.** `attachRouter` passes each mutation to `trackMutation`, which
  runs it in an `AsyncLocalStorage` scope. A query changes nothing; if one ever wrote, its change
  would go out in the background batch.
- **Changes come only from core's services.** Procedures have no way to report a change. A write the
  renderer must hear about is announced by the service that makes it, through `ChangeListeners`
  (see `CLAUDE.md`, "Change events").
- **Attribution through async context.** `ChangeListeners.emit` runs listeners synchronously, in
  the async context of the code that made the change, so the tracker finds the mutation
  responsible, even after an `await` (a note's file write).
- **Work a mutation left running** keeps the mutation's async context, but once the mutation has
  answered its changes go into the background batch instead of being lost.
- **One `db.changes` per event-loop turn.** One write often emits several events in a row (a sync
  page's progress, then the run's status). The first background change of a turn schedules the
  send with `setImmediate`, so the turn's changes go out together and the renderer refetches once.
- **Changes emitted inside a transaction** (archive, disconnect) are safe to send: main is
  single-threaded and the transaction synchronous, so nothing reaches the renderer before the
  commit.
- **Over-reporting is safe.** It only costs a refetch, so a mapping returns more when in doubt.

| Core change                                 | `ChangedEntity[]`                                                 |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `TaskChange`, `NoteChange`, `ProjectChange` | `task`, `note`, `project`                                         |
| `EventChange`, `CalendarChange`             | `event`, `calendar`                                               |
| `ArchiveChange`                             | each of `task`, `project`, `note` whose id list is not empty      |
| `FavoriteChange`                            | the favorited entity's type                                       |
| `RecentChange` (a view recorded)            | `recent`                                                          |
| `TaskLinkChange` (detach, reattach)         | `task` plus its `changed`; `credentials_rejected` → `integration` |
| `IntegrationChange`                         | `integration`, `externalSource`, plus `changed` on `disconnected` |
| `SyncProgress` (a committed page)           | its `summary.changed`                                             |
| `SyncStatusChange` (a run recorded its end) | `externalSource`                                                  |
| `WorkspaceChange`                           | `workspace`                                                       |

### Push events

Main pushes the events in [`AppEvents`](../../src/common/events.ts), each on
`ipc-event:<name>`. The renderer subscribes with `events.on(name, listener)`
([`events.ts`](../../src/renderer/ipc/events.ts)), which returns the function that unsubscribes;
the preload passes the payload only. Every event is a delta: it says what changed, carries ids,
never a snapshot and never credentials, and the renderer refetches what it shows.

| Event                  | Payload                             | Sent                                                                                   |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| `db.changes`           | `entities`                          | Background changes, once per turn, to every window; a mutation's, to the other windows |
| `workspace.changed`    | `id`, or `null` once closed         | On every open and close, to every window, the one that switched too                    |
| `sync.progress`        | `sourceId`, `phase`, `itemsApplied` | After each page a sync run commits                                                     |
| `integrations.changed` | `integrationId`, `type`             | On every `IntegrationChange`                                                           |
| `sources.changed`      | `sourceId`                          | When a source is switched on or off, or a run records how it ended                     |

`db.changes` and `workspace.changed` keep data fresh, and the query invalidator follows them. The
other three are for a status UI (a sync indicator, the integrations page). They are sent at once,
to every window, beside the entities their change maps to, so a view refetching on `changed` or
`db.changes` doesn't need them.

### Invalidation in the renderer

Main says which entities changed, but React Query caches by route, and many views read entities
other than their own. [`ENTITIES_READ_BY_ROUTE`](../../src/renderer/ipc/query-invalidator.ts)
maps one to the other: the entities each router's queries read, keyed by router, or by full path
to override its router (`integrations.previewDisconnect`, which counts synced rows of every kind).
Read the file for the current table.

`onChanged(entities)` makes one `invalidateQueries` call whose predicate matches every cached
query whose route reads one of the entities. React Query refetches the mounted ones and marks the
rest stale; the promise resolves once the refetches have landed. A route missing from the table
is refetched on **every** change, so a new route is never stale: a line in the table only makes it
cheaper.

The renderer neither batches nor defers: main already batches background changes, and a
mutation's own changes are refetched before it resolves. `main.tsx` calls
`queryInvalidator.listen(events)` once, which follows `db.changes` and `workspace.changed`.

### A workspace switch

1. `workspaces.open` (or `workspaces.openLast` at launch) opens the workspace through core's `WorkspaceService`, closing
   the open one first, if any. The tracker hears `closed` and then `opened`: it stops listening to the old
   workspace's services, starts listening to the new one's, and sends `workspace.changed` to every
   window for each.
2. `workspace.changed` is sent while the mutation runs, so it reaches the switching window before
   the response. It alone says which workspace is open.
3. When the id differs from the workspace whose data is cached, the invalidator resets every query
   outside `app`, `settings` and `workspaces` (`resetQueries` cancels what is in flight, clears the
   data and refetches what is mounted), and refetches the `workspaces` queries.
4. The mutation's response carries `changed: ['workspace']`, which only refetches the workspace
   list. Creating, renaming or recolouring a workspace (`workspaces.update`) reports the same,
   without `workspace.changed`: `workspaces.current` reads `workspace` too, so the open
   workspace's new name and colour refetch with the list.

## Testing

- **Routes** are tested end to end through `attachRouter` and a real `ChangeTracker` over a
  temporary DevBrain folder, with the Electron mock: see
  [`src/main/tests/ipc`](../../src/main/tests/ipc) and its `helpers.ts` (`tempDevBrain`,
  `testContext`, `call`). Each checks a successful call, a core error code that reaches the
  renderer, and the expected `changed`.
- **The tracker** is tested in `changes.test.ts`, **the transport** in `server.test.ts`.
  `app-events.test.ts` is a type test: it fails when core adds a sync phase or integration change
  type that `AppEvents` doesn't carry, since `src/common` restates core's values.
- **The renderer side** is tested in [`src/renderer/tests/ipc`](../../src/renderer/tests/ipc):
  the link and client in `client.test.ts`, invalidation over a real `QueryClient` in
  `query-invalidator.test.ts`.

## Adding a route

1. **Add the procedure** to its feature router in `src/main/ipc/routers`, starting from
   `wsProcedure` (or `devBrainProcedure` for app-wide data), with an input schema: `zId` for ids,
   `zPage`/`zPageFields` for lists, and core's own schemas where they exist.
2. **Return what core returns.** No reshaping, no extra lookups, no credentials (core's types
   already hold none).
3. **If the service emits nothing for the write,** add an `onChange` to the service, following
   `CLAUDE.md`'s "Change events", not to the route. A new change type also needs its mapping in
   the `ChangeTracker`, and a new kind of row a new `ChangedEntity`.
4. **Add the router to `ENTITIES_READ_BY_ROUTE`** with the entities its queries read, including
   other entities they show (a project's stats count tasks). A full path overrides its router for
   one query that reads more.
5. **Add an end-to-end test through `attachRouter`** in `src/main/tests/ipc` that checks the call's
   `changed`.
