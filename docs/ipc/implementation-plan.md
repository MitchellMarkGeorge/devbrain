# Typed IPC layer: implementation plan

The renderer calls core through one typed tRPC router and stays current when core changes data,
whether the change comes from the user or from sync. The IPC layer is a thin shell: handlers call core's
existing services, and core's existing `ChangeListeners` events tell the renderer what to refetch.

## Decisions

| Area             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location         | In this repository, split by process: `src/common/ipc`, `src/main/ipc`, `src/preload`, `src/renderer/ipc`.                                                                                                                                                                                                                                                                                                                 |
| Transport        | tRPC v11 routers in main, run over Electron IPC by a small transport of our own (`server.ts`, `ipcLink`), modelled on electron-trpc, whose adapters are stale. One `ipc:call` channel: each request names its procedure, which tRPC finds. A generic preload bridge with no code per route.                                                                                                                                |
| Contract         | `AppRouter` imported type-only by the renderer. Runtime values the renderer needs (enums, error codes, schemas) live in `src/common`.                                                                                                                                                                                                                                                                                      |
| Procedures       | tRPC's `.query()` and `.mutation()`. Only mutations open a change scope. Subscriptions don't run over IPC (see Out of scope).                                                                                                                                                                                                                                                                                              |
| Validation       | tRPC's `.input()` with Zod v4. The client sees the schema's input type, the resolver its parsed output. A failure becomes core's `invalid_input`, with the issues.                                                                                                                                                                                                                                                         |
| Errors           | An envelope `{ ok, data \| error, changed }`. `IpcErrorCode = CoreErrorCode \| 'no_workspace_open' \| 'devbrain_unavailable' \| 'cancelled' \| 'internal'`. A `CoreError` keeps its message and its own fields; anything else becomes `internal` with a generic message. The router's `errorFormatter` puts this in the `data` of tRPC's error shape, so the renderer reads `err.data.code` on a `TRPCClientError`, typed. |
| Cancellation     | Only for an OAuth sign-in waiting on the browser: a dedicated `integrations.cancelConnect` mutation aborts the flow `connect` or `reconnect` started (one per workspace), and that call fails with `cancelled`. Nothing else is cancellable: database calls are synchronous, and provider calls time out on their own.                                                                                                     |
| Data layer       | tRPC's React Query integration (`@trpc/tanstack-react-query`): `queryOptions`, `infiniteQueryOptions`, `mutationOptions`, `queryKey`, `pathKey` per route.                                                                                                                                                                                                                                                                 |
| Change reporting | A `ChangeRouter` in main subscribes to the open workspace's `onChange` streams and maps each change to `ChangedEntity[]`. Changes made during a mutation return in its response; everything else is broadcast as `db.changes`.                                                                                                                                                                                             |
| Invalidation     | A renderer-side `affects` map from entity types to query paths, plus `compile()` and one `invalidateQueries` call with a prefix predicate. Broadcasts are coalesced (16 ms trailing, 250 ms at most) and held while mutations are pending.                                                                                                                                                                                 |
| Push events      | Deltas only: `db.changes`, `sync.progress`, `integrations.changed`, `sources.changed`, `workspace.changed`. The renderer refetches instead of applying snapshots. A plain broadcast on `ipc-event:<name>`, not tRPC subscriptions: they go to the whole app and take no input.                                                                                                                                             |
| Windows          | One window. Moving to several later means broadcasting each request's `changed` to the other windows as well.                                                                                                                                                                                                                                                                                                              |

## How it fits together

```
renderer                         preload                 main
─────────────────────────        ───────────────         ─────────────────────────────────────────
createTRPCClient<AppRouter>      bridge.invoke    ───►   attachRouter(appRouter): 'ipc:call'
  .tasks.updateStatus.mutate()   { path, type,             context: { devBrain, workspace, changes }
  → ipcLink                ───►    input }                 mutation → withChangeScope(
                                                             callTRPCProcedure: validate → middleware
                                                               → resolver)
                                                             resolver → workspace.tasks.updateStatus()
                                                               TaskService emits { type: 'updated' }
                                                                 ChangeRouter → scope gets ['task']
  ipcLink ◄── { ok, data, changed: ['task'] } ◄──────────── response
  invalidateFor(['task'])
    → refetch mounted queries
    → then the mutation resolves

createEventClient<AppEvents>() ◄── bridge.subscribe ◄──── ChangeRouter.broadcast('db.changes', …)
  → coalesce → invalidateFor(...)                          (sync pages, work after a response)
```

Two flows, start to finish:

- **The user archives a task.** The transport opens a change scope and calls
  `workspace.archive.archiveTask(id)`. `ArchiveService` archives the task and its linked note and
  emits `archived` with both ids. The `ChangeRouter` hears it inside the open scope and adds
  `['task', 'note']`. The response carries `changed: ['task', 'note']`; the client invalidates the
  affected queries, waits for the mounted ones to refetch, then resolves the mutation.
- **A Linear sync updates tasks.** The scheduler runs a sync, and `SyncEngine` commits a page and
  emits progress with `summary.changed: ['task', 'project']`. No mutation scope is open, so the
  `ChangeRouter` broadcasts `db.changes`. The renderer coalesces it with any others and invalidates,
  so a favorited synced task updates in the sidebar with no code written for that case.

## File layout

```
src/common/
  changes.ts                ChangedEntity
  events.ts                 AppEvents
  errors.ts                 CoreErrorCode (moved from core)
  integrations.ts           Provider, IntegrationStatus, … (moved from core/integrations/shared-types.ts)
  ipc/
    constants.ts            the call channel, event prefix, bridge key
    types.ts                IpcRequest, IpcResult, IpcErrorShape, SerializedError, IpcErrorCode,
                            IpcBridge

src/main/ipc/
  trpc.ts                   t (initTRPC, errorFormatter)
  procedures.ts             publicProcedure, devBrainProcedure, wsProcedure
  errors.ts                 IpcError, serializeError, serializeTRPCError
  server.ts                 attachRouter: the transport over ipcMain
  context.ts                AppContext, contextFactory
  middleware.ts             logging, requireDevBrain, requireWorkspace
  zod.ts                    zId(entity), zPage
  broadcaster.ts            Broadcaster, webContentsBroadcaster
  changes/
    scope.ts                ChangeScope, withChangeScope, withLocalScope, openScope
                            (AsyncLocalStorage)
    entities.ts             WorkspaceChange, subscribeToWorkspace, changedEntities
    router.ts               ChangeRouter
  routers/                  app, workspaces, settings, tasks, archive, favorites, notes, projects,
                            events, calendars, integrations, sources, sync, search
  router.ts                 appRouter, AppRouter

src/preload/index.ts        exposeBridge()

src/renderer/ipc/
  link.ts                   ipcLink (tRPC link: envelope, onChanged)
  bridge.ts                 the preload's bridge, read at call time
  events.ts                 createEventClient
  index.ts                  ipc (createTRPCClient), events, trpc (createTRPCOptionsProxy)
src/renderer/data/
  invalidation.ts           affects, isPrefix, compile, invalidateFor
  changes.ts                applyChanges, the db.changes listener, coalescing, deferral
  queryClient.ts            QueryClient, provider setup
```

## The change router

Core already announces every change through `ChangeListeners`. The `ChangeRouter` decides only where
each change goes: into the response of the mutation that caused it, or out as a broadcast.

```
     workspace services' onChange / onProgress
     (tasks, notes, projects, events, archive, favorites, detach, integrations, sync)
                                │
                                ▼
                 changeRouter: entities = changedEntities(change)
                                │
          inside an open mutation scope? (AsyncLocalStorage)
             │ yes                                  │ no
             ▼                                      ▼
  add to that request's `changed`      broadcast 'db.changes' { entities }
```

- **Attribution.** `ChangeListeners.emit` runs listeners synchronously in the async context of
  whatever caused the change, so `AsyncLocalStorage.getStore()` inside the listener returns the
  scope of the mutation responsible, if there is one.
- **Closed scopes.** A scope closes when its response is built. Work that started inside a request
  but finishes later (a sync run started by `sync.now`, a reconnect or a calendar selection) carries
  the request's async context forward; once the scope is closed, its changes are broadcast instead of
  being lost.
- **Changes emitted inside a transaction** (`ArchiveChange`, `disconnected`). The listener runs
  before the commit, but the main process is single-threaded and the transaction synchronous: the
  response or broadcast cannot reach the renderer, nor its refetch run, until the commit is done.
- **Gaps.** `CalendarService`, `SettingsService` and the workspace registry emit nothing. Their
  handlers call `ctx.changes.record(...)`: `calendar`, `settings` and `workspace`. `ctx.changes` is
  the call's scope; a record made after the scope closed is dropped, so work that outlives its call
  reports through core's events.
- **Queries** open no scope that core's changes find. What a query's handler records still goes in
  its response, and anything core announces while it runs is broadcast.
- **Over-reporting is safe.** It only costs a refetch. When in doubt, a mapping returns more.

The mapping is one exhaustive `switch` over the sources, with an `assertNever` default, so a new
source fails typecheck until it is handled. Within a source, it switches on `type` only where the
answer depends on it (detach, integrations), so a new type there fails typecheck too; every task,
note, project or event change maps the same whatever its type:

| Core change                         | `ChangedEntity[]`                                                    |
| ----------------------------------- | -------------------------------------------------------------------- |
| `TaskChange`                        | `task`                                                               |
| `NoteChange`                        | `note`                                                               |
| `ProjectChange`                     | `project`                                                            |
| `EventChange`                       | `event`                                                              |
| `ArchiveChange`                     | each of `task`, `project`, `note` whose id list is not empty         |
| `FavoriteChange`                    | the favorited entity's type (`tasks` → `task`, …)                    |
| `TaskLinkChange` (detach, reattach) | `task` plus its `changed`; `credentials_rejected` → `integration`    |
| `IntegrationChange`                 | `integration` and `externalSource`, plus `changed` on `disconnected` |
| `SyncProgress`                      | `summary.changed`                                                    |
| `SyncStatusChange` (`onStatus`)     | `externalSource` (its `lastSyncedAt`, `lastError`, `retryAt`)        |

The router also broadcasts deltas for status UI, whatever the scope: `integrations.changed`
(`integrationId`, `type`), `sync.progress` (`sourceId`, `phase`, `itemsApplied`), `sources.changed`
(`sourceId`, on a `source_changed` and on each sync status) and `workspace.changed` (`id`, or
`null` on close; a switch sends `null`, then the new id).

## Changes to core

Core stays free of IPC and Electron (`boundary.test.ts`). It gets four small changes, all following
existing conventions:

1. **`WorkspaceService.onChange`**, built on `ChangeListeners`:
   `{ type: 'opened'; workspace: Workspace } | { type: 'closed'; workspaceId: WorkspaceId }`. It
   emits `opened` once the workspace is current and `closed` once it has closed. The change router
   follows the open workspace through it, including the one `startDevBrain` opens at launch.
2. **`SyncScheduler.onStatus`**, which passes on `SyncStateManager`'s `sync_status_changed`. Today
   nothing outside `Workspace`'s constructor can subscribe to source status.
3. **Move `integrations/shared-types.ts` to `src/common/integrations.ts`**, with a re-export in
   core, and point `boundary.test.ts` at the new location.
4. **Move the `CoreErrorCode` union to `src/common/errors.ts`.** `core/shared/errors.ts` imports it
   from there.

---

## Milestone 1: Setup and shared types

This blocks everything else, so it comes first.

**Steps**

1. Add `@common` to `tsconfig.web.json` `paths` and to `vite/preload.config.ts` and
   `vite/renderer.config.ts`. The main config already uses `tsconfigPaths`.
2. Let the renderer typecheck against `AppRouter`: `tsconfig.web.json` maps `@main/*` to
   `src/main`, which the renderer imports only as `import type { AppRouter }`. Neither project
   emits anything. An ESLint rule (`no-restricted-imports` with `allowTypeImports`) rejects a value
   import, which Vite would bundle. (Milestone 1 first emitted main's declarations for the renderer
   to read; milestone 2 dropped that as more than the one type import needs.)
3. Vitest: add `src/common/**/*.test.ts` and `src/renderer/**/*.test.ts` to `include`, and add an
   `electron` mock (`ipcMain.handle`/`removeHandler`, `BrowserWindow.getAllWindows`).
4. Make core changes 3 and 4 (move the shared types and the `CoreErrorCode` union).
5. Add `src/common/changes.ts` (`ChangedEntity`) and `src/common/events.ts` (`AppEvents`).

**Tests**

- `boundary.test.ts` checks the new location of the shared types.
- A renderer type test: `app.ping`'s output, read from `AppRouter`, is `string`.

**Done when** `npm run typecheck`, `lint`, `test` and all three Vite builds pass, and a wrong router
output type fails the renderer's typecheck.

## Milestone 2: tRPC over IPC

tRPC owns the router, validation, middleware, the client and their types. What it has no Electron
transport for is ours: one IPC channel carrying each call, and the envelope with `changed`. The
transport is modelled on electron-trpc, without its subscriptions: a call is one `invoke`, with no
request ids.

**Steps**

1. Install `@trpc/server` and `@trpc/client`.
2. **`src/common/ipc`:** constants (`ipc:call`, the event prefix, the bridge key) and the types the
   renderer reads: `IpcRequest` (`path`, `type`, `input`), `IpcResult`, `IpcErrorShape`,
   `SerializedError`, `IpcErrorCode`, `IpcBridge`.
3. **`src/main/ipc`, errors:**
   - `errors.ts`: `serializeError`. A `CoreError` keeps `code` and `message`, and its own fields go
     into `data` (without `cause` or `stack`). An `IpcError`, for the layer's own failures, is kept
     as it is. Anything else becomes `internal` with "Something went wrong", and main logs it.
   - `trpc.ts`: `initTRPC.context<AppContext>()` with an `errorFormatter` that serializes what the
     resolver threw (tRPC's `cause`) into the shape's `data`. A failed input parse (`BAD_REQUEST`
     with `issues`) becomes core's `invalid_input` with the issues.
4. **`src/main/ipc/server.ts`:** `attachRouter(router, { createContext, onError })`
   registers one `ipc:call` handler:
   - It runs the request with `callTRPCProcedure`. Main trusts nothing from the renderer: only
     queries and mutations run, and tRPC answers an unknown path or a type that isn't the
     procedure's with `NOT_FOUND`. Each fails as `internal`.
   - `createContext({ event, changes })` is typed from the router. `changes.record()` fills the
     response's `changed`, on failure too; milestone 3 fills it from core's events as well.
   - A disposer that removes the handler.
5. **`src/preload/index.ts`:**
   - `exposeBridge()` provides `invoke({ path, type, input })` and `subscribe(name, cb)`.
   - It passes only the payload to listeners, never the `IpcRendererEvent`. It checks nothing:
     the channel names are fixed, and main checks the requests.
   - Replace the hand-written `api` and update `src/renderer/env.d.ts`.
6. **`src/renderer/ipc`:**
   - `ipcLink({ onChanged })`: a tRPC link that invokes the bridge, unwraps the envelope, waits on
     `onChanged(changed)`, then resolves or throws a `TRPCClientError` carrying our error as
     `data`. A missing bridge fails with an error pointing at the preload.
   - `ipc = createTRPCClient<AppRouter>({ links: [ipcLink()] })`.
   - `createEventClient<AppEvents>().on(name, cb)` returns an unsubscribe function.
7. **The first route:** `app.ping` and `app.version`, replacing the two `ipcMain.handle` calls in
   `src/main/index.ts`. `attachRouter` runs right after `startCore()` is called, so the window's
   first calls find the handler.

**Tests**

- `serializeError` on `RateLimitError` (`retryAt`), `DevBrainFolderError` (`reason`),
  `IntegrationAlreadyConnectedError` (`integrationId`), and a plain `Error`.
- The transport: success, `invalid_input`, a `CoreError` round-trip, an `IpcError` from a
  middleware, `internal`, middleware order, `changed` on success and failure, an unknown path, a
  wrong type, and a malformed request.
- The link: the request sent, unwrapping, the error's `data`, a failed invoke, a missing bridge,
  `await` on a router node not hanging, `onChanged` being awaited before resolving and throwing.
- The preload: the request forwarded, the payload alone passed to listeners, and a bundle that
  `require`s only `electron`.
- Types: `app.ping`'s output from `AppRouter`, and a `TRPCClientError<AppRouter>`'s `data.code`
  is `IpcErrorCode`.

**Done when** the running app's renderer calls `ipc.app.ping.query()` and gets `'pong'` with the
correct type.

## Milestone 3: Change router and wiring into the app

**Steps**

1. Make core changes 1 and 2 (`WorkspaceService.onChange`, `SyncScheduler.onStatus`), each with
   tests next to the existing ones.
2. **`changes/scope.ts`:** `withChangeScope(fn)` returns `{ ok, value | error, changed }`, and
   `changed` is filled on failures too. `openScope()` returns the scope only while it is open.
3. **`changes/entities.ts`:**
   - The `WorkspaceChange` union, tagged by source: tasks, notes, projects, events, archive,
     favorites, detach, integrations, sync (`onProgress`) and syncStatus (`onStatus`), with
     `subscribeToWorkspace` subscribing to all of them.
   - `changedEntities`, an exhaustive `switch` per source, and per `type` where the answer
     depends on it, with `assertNever` defaults (see the mapping table above).
4. **`changes/router.ts`:** `ChangeRouter`.
   - `attach(devBrain)`: subscribes to the current workspace now, then follows
     `workspaces.onChange`, subscribing on `opened` and unsubscribing on `closed`. It broadcasts
     `workspace.changed`.
   - `route(entities)`: adds to the open scope, or broadcasts `db.changes`.
   - It also broadcasts the deltas: `integrations.changed`, `sync.progress`, `sources.changed`.
5. **The transport** wraps each mutation's `callTRPCProcedure` in `withChangeScope` and returns
   the scope's `changed` on success and on failure. `ctx.changes.record()` adds to the same scope:
   the context is built inside it, and the scope is the `ChangeRecorder` milestone 2 passed to
   `createContext`. A query runs in `withLocalScope`, which only its handler records into.
   (A tRPC middleware can't do this: it can only return the resolver's output, with no room for
   `changed` beside it.)
6. **Context and middleware** (tRPC middleware, built with `t.middleware`):
   - `contextFactory({ devBrain: startCore(), log })` is attachRouter's `createContext`, returning
     `{ event, devBrain, workspace: devBrain.currentWorkspace, changes, log }`, read fresh on every
     call. It awaits `startCore()`, so calls made while core starts wait for it.
   - No sender guard: the window is sandboxed and can't open windows or navigate (step 7), so
     only the app's page can be in it to call main. (The plan first had a `senderGuard` checking
     each call's frame URL; milestone 3 dropped it as a second check of the same thing.)
   - `logging`: path, duration and error code, never the input; success at debug, failure at warn.
   - `requireDevBrain` → `devbrain_unavailable` when `startCore()` returned `null`;
     `requireWorkspace` → that, or `no_workspace_open`. Each narrows the context.
   - Base procedures in `procedures.ts` (`trpc.ts` holds `t`, which the middleware imports), each
     for a query or a mutation: `publicProcedure`, `devBrainProcedure` (workspaces, settings) and
     `wsProcedure`. Routes never use `t.procedure`; `app.ping` and `app.version` are public ones.
   - `zId(entity)`, which checks the prefix with `isId` from `src/common/ids.ts`.
7. **`src/main/index.ts`:**
   - Once `startCore()` resolves, create the `Broadcaster` and call `ChangeRouter.attach`.
     `attachRouter` stays where milestone 2 put it.
   - Window hardening from `docs/security/untrusted-content.md`: `setWindowOpenHandler` → deny, and
     a `will-navigate` guard that cancels every navigation but a reload of the current page. The
     app routes within its page, which is no navigation.
8. **The first real routes:**
   - `workspaces`: `list`, `current`, `open`, `switch`, `create`, `delete`. These return
     `WorkspaceInfo`, never a `Workspace`, and record `workspace`. `create` doesn't open the new
     workspace: core's `WorkspaceService.create` now closes the database it created and returns
     the info, so a workspace is only ever open through `open` or `switch`. `open` and `switch` write
     `state.lastWorkspaceId`, which `startDevBrain` reopens at launch and nothing wrote before, and
     `delete` clears it.
   - `settings`: `get` returns the user's settings; `update` takes the whole settings object,
     validated by `appSettingsSchema` from `core/settings/schema.ts`, saves it and returns it. The
     app's state beside them in the settings file (`state`) has no route: only main uses it.
   - `workspace.openUrl`, which goes through core's `guardOpenExternal`.

**Tests** (in `src/main/tests/ipc/`, with an in-memory workspace and a fake `Broadcaster`)

- Archiving a task with a linked note returns `changed: ['task', 'note']` and broadcasts nothing.
- Favoriting a task returns `changed: ['task']`; favoriting it again returns `[]`.
- A sync progress event outside any scope broadcasts `db.changes` with `summary.changed`.
- A change emitted after the scope closed is broadcast.
- A mutation that throws after one committed write returns that write's type in `changed`.
- After a workspace switch, the old workspace's changes are ignored and the new one's are routed.
- `attach` picks up a workspace that was already open before IPC attached.

**Done when** the renderer can switch workspaces and see `workspace.changed`, and an archive's
response carries `changed`.

## Milestone 4: React Query and invalidation

**Steps**

1. Install `@tanstack/react-query`, `@tanstack/react-query-devtools` and
   `@trpc/tanstack-react-query`.
2. **Check first** that tRPC's React Query integration runs over `ipcLink`: one query and one
   mutation, in a test component. Milestone 2 did not cover it.
3. **`trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient })`** in
   `src/renderer/ipc/index.ts`. It gives each query `queryOptions`, `infiniteQueryOptions` and
   `queryKey`, each mutation `mutationOptions`, and each router `pathKey`. `infiniteQueryOptions`
   works on core's lists as they are: they take `cursor` and return `{ items, nextCursor }`. React
   Query's `signal` reaches the link and is ignored: no call is cancellable through it.
4. **`invalidation.ts`:**
   - `affects: Record<ChangedEntity, Path[]>`, keyed at router level:

     | Entity           | Paths                                                 |
     | ---------------- | ----------------------------------------------------- |
     | `task`           | `tasks`, `projects`, `favorites`, `search`, `archive` |
     | `note`           | `notes`, `favorites`, `search`, `archive`             |
     | `project`        | `projects`, `tasks`, `favorites`, `search`, `archive` |
     | `event`          | `events`, `favorites`, `search`                       |
     | `calendar`       | `calendars`, `events`                                 |
     | `integration`    | `integrations`, `sync`                                |
     | `externalSource` | `integrations`, `sources`, `sync`                     |
     | `workspace`      | `workspaces`                                          |
     | `settings`       | `settings`                                            |

   - `isPrefix`, `compile` (merge, deduplicate, drop covered prefixes), and
     `invalidateFor(entities)` as one predicate call. tRPC's query keys start with the path array
     (`[['tasks', 'get'], { input, type }]`), so the predicate matches a prefix of that.

5. **`changes.ts`:**
   - One dirty set.
   - `applyChanges(changed)`, the client's `onChanged`: if this is the only mutation in flight,
     invalidate and wait for the refetch; otherwise add to the dirty set.
   - A `db.changes` listener that adds to the dirty set.
   - Flushing: 16 ms trailing, 250 ms at most, held while `isMutating() > 0`, and rescheduled when
     the mutation cache settles.
   - `workspace.changed` → `qc.clear()`.
6. **`main.tsx`:** create the client with `ipcLink({ onChanged: applyChanges })`, the
   `QueryClientProvider` and the devtools in development, and start the listeners once.

**Tests** (Node, with fake timers)

- `compile` and `isPrefix` edge cases.
- A burst gives one flush; a steady stream still flushes at least every 250 ms; nothing flushes
  while a mutation is pending.
- `applyChanges` waits for the refetch when it is the only mutation in flight and defers when others
  are pending.
- `invalidateFor(['task'])` matches `[['tasks', …], …]`, `[['projects', …], …]` and
  `[['favorites', …], …]` keys and leaves `[['notes', …], …]` alone.

**Done when** a test component's mutation and a simulated `db.changes` broadcast both refetch the
right mounted queries.

## Milestone 5: Routes by feature

Each router is a thin layer: an input schema, a call to `ctx.workspace.<service>.<method>()`, and
core's return value. Most handlers are synchronous one-liners, since core's database access is
synchronous.

| Router         | Procedures                                                                                                                                                                          | Notes                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`        | `list` (infinite), `get`, `subtasks`, `create`, `createSubtask`, `update`, `updateStatus`, `updateProject`, `updateLinks`, `promote`, `demote`, `setFavorite`, `detach`, `reattach` | `detach`/`reattach` call `workspace.detach`. Core already moves a rejected reattach to `needs_reauth`.                                                                                                          |
| `archive`      | `archiveTask`, `restoreTask`, `archiveProject`, `restoreProject`, `archiveNote`, `restoreNote`, `listArchived`                                                                      | Cascades come back in `changed` from `ArchiveChange`.                                                                                                                                                           |
| `notes`        | `list`, `get`, `create`, `update`, `updateContent`, `setFavorite`                                                                                                                   | `updateContent` is async (a file write); core serializes concurrent saves.                                                                                                                                      |
| `projects`     | `list`, `get`, `create`, `update`, `updateStatus`, `stats`, `setFavorite`                                                                                                           |                                                                                                                                                                                                                 |
| `events`       | `listForCalendar`, `get`, `create`, `update`, `delete`, `setFavorite`                                                                                                               |                                                                                                                                                                                                                 |
| `favorites`    | `list` (infinite, with the `entityType` filter)                                                                                                                                     | `listFavorites`. Favoriting itself is each entity router's `setFavorite`.                                                                                                                                       |
| `calendars`    | `list`, `setVisible`, `setSelected`                                                                                                                                                 | `CalendarService` emits nothing, so these call `ctx.changes.record('calendar')`. `setSelected` also calls `workspace.sync.syncNow(sourceId)` when the calendar has a source.                                    |
| `integrations` | `list`, `get`, `connect` (API key or OAuth), `reconnect`, `cancelConnect`, `setEnabled`, `previewDisconnect`, `disconnect`                                                          | An OAuth `connect` or `reconnect` keeps its flow's `AbortController` in the router; `cancelConnect` aborts it (one flow per workspace, so no id), and the aborted call maps core's `AbortError` to `cancelled`. |
| `sources`      | `setEnabled`                                                                                                                                                                        |                                                                                                                                                                                                                 |
| `sync`         | `now`, `status`                                                                                                                                                                     |                                                                                                                                                                                                                 |
| `search`       | `search`                                                                                                                                                                            | Results contain the one allowed HTML (`<b>` highlights), per `docs/security/untrusted-content.md`.                                                                                                              |

**`setFavorite`** takes the state wanted, not a flip of what is stored, so a double click or a stale
view cannot leave it the opposite of what the user saw. The star button passes the opposite of what
it shows:

```ts
setFavorite: wsProcedure
  .input(z.object({ id: zId('task'), favorite: z.boolean() }))
  .mutation(({ ctx, input }) =>
    input.favorite
      ? ctx.workspace.favorites.favoriteTask(input.id)
      : ctx.workspace.favorites.unfavoriteTask(input.id),
  ),
```

Core's favorite methods are idempotent and emit nothing when nothing changed, so a repeated click
returns `changed: []` and refetches nothing.

**Order:** tasks + archive; then integrations + sources + sync + calendars; then notes, projects,
events, favorites and search.

**For each router**

- Input schemas use `zId` for ids, and core's own Zod schemas where they exist (`safeUrlSchema`,
  `hexColorSchema`, the settings schema).
- One end-to-end test through `attachRouter` with an in-memory workspace: a successful call, a
  `CoreError` code that reaches the renderer (for example `external_read_only` on a synced task),
  and the expected `changed`.
- A new entity type, if any, goes into `ChangedEntity`, `changedEntities` and `affects`.

**Done when** every operation listed in `docs/integrations/tech-design.md` § "IPC contract" has a
route.

## Milestone 6: Documentation

1. Write `docs/ipc/design.md`, the reference for the layer as built, with a short "adding a route"
   checklist:
   - Add the procedure to its feature router, with an input schema.
   - Return what core returns.
   - Call `ctx.changes.record()` only if the service emits nothing.
   - Update `affects` only when a new entity or view is involved.
2. In `docs/integrations/tech-design.md`, replace "IPC contract (deferred)" with a pointer to the
   router and the `AppEvents` names.
3. In `docs/follow-ups.md`, close the calendar-selection sync item and the delta-vs-snapshot item
   for `IntegrationChange`.
4. Add a short "IPC" section to `CLAUDE.md`: core never imports from `src/main/ipc`; the renderer
   imports from `src/main` as a type only; handlers return core's data as it is; a new change type
   must be added to `changedEntities`.

---

## Optimistic updates

An optimistic update patches the renderer's cache when the user acts, before the IPC call returns,
and is replaced by real data afterwards. These are written per interaction in the renderer; the
star toggle is the likely first one. The layer makes them safe:

- **What the layer guarantees.** `applyChanges` defers while other mutations are pending, so one
  mutation's refetch cannot overwrite another's patch with data from before it committed. A mutation
  resolves only after its `changed` has been refetched, so the swap from patch to real data has no
  gap. `changed` is returned on failure too, so whatever did commit is refetched.
- **What each optimistic mutation must do.** In `onMutate`, call `cancelQueries` and patch fields
  only; never add or remove list items, which the refetch does. Roll back in `onError`, by restoring
  a snapshot or invalidating the affected paths: a failure that committed nothing returns
  `changed: []`, so nothing else would undo the patch.
- **Optimistic creates, if a view needs them later.** Core generates ids in the table default, and
  `create…` options take no id. Showing a new item before its call returns, with the id it will
  keep, needs the renderer to generate the id (`generateId` in `src/common/ids.ts`) and `create…`
  to accept it, validated by `zId`. That is a core change, made only when a view needs it.

---

## PR breakdown

| #    | Contents                                                                                                                | Depends on                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1    | Milestone 1: setup, aliases, Vitest, moving shared types                                                                | none                        |
| 2    | Milestone 2: tRPC over IPC and `app.ping`                                                                               | 1                           |
| 3    | Core changes 1 and 2 (`WorkspaceService.onChange`, `SyncScheduler.onStatus`)                                            | none; can run alongside 1–2 |
| 4    | Milestone 3: change router, context, middleware, window hardening, workspace/settings/openUrl routes                    | 2, 3                        |
| 5    | Milestone 4: React Query and invalidation                                                                               | 4                           |
| 6a–c | Milestone 5: tasks + archive; integrations + sources + sync + calendars; notes + projects + events + favorites + search | 5                           |
| 7    | Milestone 6: documentation                                                                                              | 6                           |

## Out of scope

- **More than one window.** Covered later by also broadcasting each request's `changed`.
- **tRPC subscriptions.** The push events go to the whole app and take no input, so a broadcast
  serves them. Subscriptions would need the transport to manage each one's lifetime (start, stop,
  cleanup when a window reloads or closes), as electron-trpc's `createIPCHandler` does; that is the
  model if a view ever needs a stream of its own.
- **Optimistic update helpers** (`patchTask` and similar), and client-generated ids for optimistic
  creates. Added per interaction once the UI exists.
- **The renderer's rendering rules** (Markdown, URLs, colours). These come from
  `docs/security/untrusted-content.md` when the views are built.
