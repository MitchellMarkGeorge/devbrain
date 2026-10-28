# Typed IPC layer: implementation plan

The renderer calls core through one typed router and stays current when core changes data, whether
the change comes from the user or from sync. The IPC layer is a thin shell: handlers call core's
existing services, and core's existing `ChangeListeners` events tell the renderer what to refetch.

## Decisions

| Area             | Decision                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location         | In this repository, split by process: `src/common/ipc`, `src/main/ipc`, `src/preload`, `src/renderer/ipc`.                                                                                                                                                                                                             |
| Transport        | A tRPC-style router defined once in main. One `ipc:<path>` channel per procedure. A generic preload bridge with no code per route.                                                                                                                                                                                     |
| Contract         | `AppRouter` imported type-only by the renderer. Runtime values the renderer needs (enums, error codes, schemas) live in `src/common`.                                                                                                                                                                                  |
| Procedures       | `.query()` and `.mutation()`. Only mutations open a change scope.                                                                                                                                                                                                                                                      |
| Validation       | Standard Schema (Zod v4). The client sees the schema's input type, the resolver its parsed output. A failure throws core's `invalid_input`.                                                                                                                                                                            |
| Errors           | An envelope `{ ok, data \| error, changed }`. `IpcErrorCode = CoreErrorCode \| 'no_workspace_open' \| 'devbrain_unavailable' \| 'cancelled' \| 'internal'`. A `CoreError` keeps its message and its own fields; anything else becomes `internal` with a generic message.                                               |
| Cancellation     | Only for an OAuth sign-in waiting on the browser: a dedicated `integrations.cancelConnect` mutation aborts the flow `connect` or `reconnect` started (one per workspace), and that call fails with `cancelled`. Nothing else is cancellable: database calls are synchronous, and provider calls time out on their own. |
| Data layer       | React Query with an adapter: `queryOptions`, `infiniteQueryOptions`, `mutationOptions`, `queryKey`, `pathKey`.                                                                                                                                                                                                         |
| Change reporting | A `ChangeRouter` in main subscribes to the open workspace's `onChange` streams and maps each change to `ChangedEntity[]`. Changes made during a mutation return in its response; everything else is broadcast as `db.changes`.                                                                                         |
| Invalidation     | A renderer-side `affects` map from entity types to query paths, plus `compile()` and one `invalidateQueries` call with a prefix predicate. Broadcasts are coalesced (16 ms trailing, 250 ms at most) and held while mutations are pending.                                                                             |
| Push events      | Deltas only: `db.changes`, `sync.progress`, `integrations.changed`, `sources.changed`, `workspace.changed`. The renderer refetches instead of applying snapshots.                                                                                                                                                      |
| Windows          | One window. Moving to several later means broadcasting each request's `changed` to the other windows as well.                                                                                                                                                                                                          |

## How it fits together

```
renderer                         preload                 main
─────────────────────────        ───────────────         ─────────────────────────────────────────
createClient<AppRouter>()  ───►  bridge.invoke    ───►   attachRouter(appRouter)
  .tasks.updateStatus(input)                               context: { devBrain, workspace, changes }
                                                           validate → middleware → resolver
                                                           mutation → withChangeScope(...)
                                                             resolver → workspace.tasks.updateStatus()
                                                               TaskService emits { type: 'updated' }
                                                                 ChangeRouter → scope gets ['task']
  ◄── { ok, data, changed: ['task'] } ◄─────────────────── response
  invalidateFor(['task'])
    → refetch mounted queries
    → then the mutation resolves

createEventClient<AppEvents>() ◄── bridge.subscribe ◄──── ChangeRouter.broadcast('db.changes', …)
  → coalesce → invalidateFor(...)                          (sync pages, work after a response)
```

Two flows, start to finish:

- **The user archives a task.** The server opens a change scope and calls
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
    constants.ts            channel and event prefixes, bridge key
    types.ts                IpcResult, SerializedError, IpcErrorCode, StandardSchemaV1 (inlined)
    errors.ts               IpcError, serializeError
    procedure.ts            initIpc, ProcedureBuilder, Procedure, createRouter, RouterContext
    client-types.ts         Client<TRouter>, inferInput, inferOutput

src/main/ipc/
  server.ts                 flatten, execute, attachRouter
  context.ts                AppContext, createContext
  middleware.ts             senderGuard, logging, requireWorkspace
  init.ts                   t, publicQuery/Mutation, wsQuery/Mutation
  zod.ts                    zId(entity), shared input schemas
  broadcaster.ts            Broadcaster over webContents
  changes/
    scope.ts                withChangeScope, openScope (AsyncLocalStorage)
    entities.ts             WorkspaceChange, changedEntities (exhaustive)
    router.ts               ChangeRouter
  routers/                  app, workspaces, settings, tasks, archive, favorites, notes, projects,
                            events, calendars, integrations, sources, sync, search
  router.ts                 appRouter, AppRouter

src/preload/index.ts        exposeBridge()

src/renderer/ipc/
  client.ts                 createClient (proxy, envelope, onChanged)
  events.ts                 createEventClient
  query.ts                  createQueryUtils (TanStack adapter)
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
  handlers call `ctx.changes.record(...)`.
- **Over-reporting is safe.** It only costs a refetch. When in doubt, a mapping returns more.

The mapping is one exhaustive `switch` per change union, with `assertNever` defaults, so a new
change type fails typecheck until it is handled:

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

The router also broadcasts deltas for status UI, whatever the scope: `integrations.changed`
(`integrationId`, `type`), `sync.progress` (`sourceId`, `phase`, `itemsApplied`), `sources.changed`
(`sourceId`) and `workspace.changed` (`id`, or `null` on close).

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
   import, which Vite would bundle. (Milestone 1 first emitted main's declarations for the renderer to read; Milestone 2
   dropped that as more than the one type import needs.)
3. Vitest: add `src/common/**/*.test.ts` and `src/renderer/**/*.test.ts` to `include`, and add an
   `electron` mock (`ipcMain.handle`/`removeHandler`, `BrowserWindow.getAllWindows`).
4. Make core changes 3 and 4 (move the shared types and the `CoreErrorCode` union).
5. Add `src/common/changes.ts` (`ChangedEntity`) and `src/common/events.ts` (`AppEvents`).

**Tests**

- `boundary.test.ts` checks the new location of the shared types.
- A renderer type test: `Client<AppRouter>['app']['ping']` returns `Promise<string>`.

**Done when** `npm run typecheck`, `lint`, `test` and all three Vite builds pass, and a wrong router
output type fails the renderer's typecheck.

## Milestone 2: The IPC library

**Steps**

1. **`src/common/ipc`:**
   - Constants and the result types.
   - `serializeError`: a `CoreError` keeps `code` and `message`, and its own fields go into `data`
     (without `cause` or `stack`). Anything else becomes `internal` with "Something went wrong".
   - Builder: `.input(schema)`, `.use(middleware)`, `.query(resolver)`, `.mutation(resolver)`.
     Resolvers receive `{ ctx, input }`. `initIpc`, `createRouter`, `RouterContext`.
   - `Client<TRouter>`: `(input) => Promise<Output>`, with no argument for `void` inputs.
2. **`src/main/ipc/server.ts`:**
   - `flatten`: throw on duplicate paths or reserved segment names (`then`, `queryKey`, `pathKey`,
     `queryOptions`, `infiniteQueryOptions`, `mutationOptions`).
   - `attachRouter(router, { createContext, onError })`, which registers one handler per path. Per
     call it validates the input (failure → `invalid_input` with the
     issues in `data`), runs the middleware chain (`next()` may only be called once) and returns the
     envelope. `changed` is `[]` here; milestone 3 fills it.
   - In development only, a `structuredClone` check on each result, with an error naming the path.
   - A disposer that removes every handler.
3. **`src/preload/index.ts`:**
   - `exposeBridge()` provides `invoke(path, input)` and `subscribe(name, cb)`.
   - It checks path and name strings against `/^[a-zA-Z0-9_.]+$/` and passes only the payload to
     listeners, never the `IpcRendererEvent`.
   - Replace the hand-written `api` and update `src/renderer/env.d.ts`.
4. **`src/renderer/ipc`:**
   - `createClient({ onChanged })`, a recursive proxy. It returns `undefined` for `then` and symbol
     keys, unwraps the envelope, and waits on `onChanged(changed)` before resolving or throwing.
   - `createEventClient<AppEvents>().on(name, cb)` returns an unsubscribe function.
5. **The first route:** `app.ping` and `app.version` through `attachRouter`, replacing the two
   `ipcMain.handle` calls in `src/main/index.ts`.

**Tests**

- Type inference: inputs, outputs, Zod defaults, `void` inputs, context narrowing through `.use()`.
- `serializeError` on `RateLimitError` (`retryAt`), `DevBrainFolderError` (`reason`),
  `IntegrationAlreadyConnectedError` (`integrationId`), and a plain `Error`.
- The server: success, `invalid_input`, a `CoreError` round-trip, `internal`, middleware order and
  short-circuit, and the clone check.
- The client: path building, unwrapping, `IpcError` reconstruction, `await` on a router node not
  hanging, `onChanged` being awaited.
- The preload bundle `require`s only `electron`.

**Done when** the running app's renderer calls `ipc.app.ping()` and gets `'pong'` with the correct
type.

## Milestone 3: Change router and wiring into the app

**Steps**

1. Make core changes 1 and 2 (`WorkspaceService.onChange`, `SyncScheduler.onStatus`), each with
   tests next to the existing ones.
2. **`changes/scope.ts`:** `withChangeScope(fn)` returns `{ ok, value | error, changed }`, and
   `changed` is filled on failures too. `openScope()` returns the scope only while it is open.
3. **`changes/entities.ts`:**
   - The `WorkspaceChange` union, tagged by source: tasks, notes, projects, events, archive,
     favorites, detach, integrations, sync.
   - `changedEntities`, an exhaustive `switch` per source and per `type`, with `assertNever`
     defaults (see the mapping table above).
4. **`changes/router.ts`:** `ChangeRouter`.
   - `attach(devBrain)`: subscribes to the current workspace now, then follows
     `workspaces.onChange`, subscribing on `opened` and unsubscribing on `closed`. It broadcasts
     `workspace.changed`.
   - `route(entities)`: adds to the open scope, or broadcasts `db.changes`.
   - `record(...entities)`: for handlers whose service emits nothing.
   - It also broadcasts the deltas: `integrations.changed`, `sync.progress`, `sources.changed`.
5. **The server** wraps every mutation in `withChangeScope` and returns `changed` on success and on
   failure.
6. **Context and middleware:**
   - `createContext = () => ({ devBrain, workspace: devBrain.currentWorkspace, changes, log })`,
     read fresh on every call.
   - `senderGuard`: the app's own page only (the dev server URL, or `file://…/renderer/index.html`).
   - `logging`: path, duration and error code, never the input.
   - `requireWorkspace` → `no_workspace_open`. If `startCore()` returned `null`, every route that
     needs `DevBrain` fails with `devbrain_unavailable`.
   - Base procedures: `publicQuery`/`publicMutation` and `wsQuery`/`wsMutation`.
   - `zId(entity)`, which checks the prefix from `src/common/ids.ts`.
7. **`src/main/index.ts`:**
   - Once `startCore()` resolves, create the `Broadcaster`, call `ChangeRouter.attach`, and call
     `attachRouter`.
   - Window hardening from `docs/security/untrusted-content.md`: `setWindowOpenHandler` → deny, and
     a `will-navigate` guard that only allows the app's own pages.
8. **The first real routes:**
   - `workspaces`: `list`, `current`, `open`, `switch`, `create`, `delete`. These return
     `WorkspaceInfo`, never a `Workspace`, and call `ctx.changes.record()` where nothing emits.
   - `settings`: `get` returns the whole settings file; `update` takes a patch validated against
     `core/settings/schema.ts`.
   - `workspace.openUrl`, which goes through core's `guardOpenExternal`.

**Tests** (in `src/main/tests/ipc/`, with an in-memory workspace and a fake `Broadcaster`)

- Archiving a task with a linked note returns `changed: ['task', 'note']` and broadcasts nothing.
- Favoriting a task returns `changed: ['task']`; favoriting it again returns `[]`.
- A sync progress event outside any scope broadcasts `db.changes` with `summary.changed`.
- A change emitted after the scope closed is broadcast.
- A mutation that throws after one committed write returns that write's type in `changed`.
- After a workspace switch, the old workspace's changes are ignored and the new one's are routed.
- `attach` picks up a workspace that was already open before IPC attached.
- `senderGuard` rejects a frame from another origin.

**Done when** the renderer can switch workspaces and see `workspace.changed`, and an archive's
response carries `changed`.

## Milestone 4: React Query and invalidation

**Steps**

1. Install `@tanstack/react-query` and `@tanstack/react-query-devtools`.
2. **`createQueryUtils<AppRouter>()`:**
   - Queries: `queryKey(input?)` → `[...path, input]`, `queryOptions(input, opts?)`, and
     `infiniteQueryOptions(input, opts?)` built on `Page<T>` cursors.
   - Mutations: `mutationOptions(opts?)`.
   - Router nodes: `pathKey()` → `[...path]`.
   - The types only offer each option builder on the matching procedure kind. React Query's
     `signal` is not passed on: no call is cancellable through it.
3. **`invalidation.ts`:**
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

   - `isPrefix`, `compile` (merge, deduplicate, drop covered prefixes), and
     `invalidateFor(entities)` as one predicate call.

4. **`changes.ts`:**
   - One dirty set.
   - `applyChanges(changed)`, the client's `onChanged`: if this is the only mutation in flight,
     invalidate and wait for the refetch; otherwise add to the dirty set.
   - A `db.changes` listener that adds to the dirty set.
   - Flushing: 16 ms trailing, 250 ms at most, held while `isMutating() > 0`, and rescheduled when
     the mutation cache settles.
   - `workspace.changed` → `qc.clear()`.
5. **`main.tsx`:** create the client with `onChanged: applyChanges`, the `QueryClientProvider` and
   the devtools in development, and start the listeners once.

**Tests** (Node, with fake timers)

- `compile` and `isPrefix` edge cases.
- A burst gives one flush; a steady stream still flushes at least every 250 ms; nothing flushes
  while a mutation is pending.
- `applyChanges` waits for the refetch when it is the only mutation in flight and defers when others
  are pending.
- `invalidateFor(['task'])` matches `['tasks', …]`, `['projects', …]` and `['favorites', …]` keys
  and leaves `['notes', …]` alone.

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
setFavorite: wsMutation
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
4. Add a short "IPC" section to `CLAUDE.md`: core never imports from `src/main/ipc`; handlers return
   core's data as it is; a new change type must be added to `changedEntities`.

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
| 2    | Milestone 2: the IPC library and `app.ping`                                                                             | 1                           |
| 3    | Core changes 1 and 2 (`WorkspaceService.onChange`, `SyncScheduler.onStatus`)                                            | none; can run alongside 1–2 |
| 4    | Milestone 3: change router, context, middleware, window hardening, workspace/settings/openUrl routes                    | 2, 3                        |
| 5    | Milestone 4: React Query and invalidation                                                                               | 4                           |
| 6a–c | Milestone 5: tasks + archive; integrations + sources + sync + calendars; notes + projects + events + favorites + search | 5                           |
| 7    | Milestone 6: documentation                                                                                              | 6                           |

## Out of scope

- **More than one window.** Covered later by also broadcasting each request's `changed`.
- **Optimistic update helpers** (`patchTask` and similar), and client-generated ids for optimistic
  creates. Added per interaction once the UI exists.
- **The renderer's rendering rules** (Markdown, URLs, colours). These come from
  `docs/security/untrusted-content.md` when the views are built.
