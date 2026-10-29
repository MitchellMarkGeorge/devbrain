# Typed IPC layer: implementation plan

The renderer calls core through one typed tRPC router and stays current when core changes data,
whether the change comes from the user or from sync. The IPC layer is a thin shell: handlers call core's
existing services, and core's existing `ChangeListeners` events tell the renderer what to refetch.

How the renderer stays current was researched separately, with a survey of other approaches and
measurements of what refetching costs: `docs/ipc/change-propagation-research.md`. This plan
describes what was built from it.

## Decisions

| Area             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location         | In this repository, split by process: `src/common/ipc`, `src/main/ipc`, `src/preload`, `src/renderer/ipc`.                                                                                                                                                                                                                                                                                                                                            |
| Transport        | tRPC v11 routers in main, run over Electron IPC by a small transport of our own (`server.ts`, `ipcLink`), modelled on electron-trpc, whose adapters are stale. One `ipc:call` channel: each request names its procedure, which tRPC finds. A generic preload bridge with no code per route.                                                                                                                                                           |
| Contract         | `AppRouter` imported type-only by the renderer. Runtime values the renderer needs (enums, error codes, schemas) live in `src/common`.                                                                                                                                                                                                                                                                                                                 |
| Procedures       | tRPC's `.query()` and `.mutation()`. Only mutations open a change scope. Subscriptions don't run over IPC (see Out of scope).                                                                                                                                                                                                                                                                                                                         |
| Validation       | tRPC's `.input()` with Zod v4. The client sees the schema's input type, the resolver its parsed output. A failure becomes core's `invalid_input`, with the issues.                                                                                                                                                                                                                                                                                    |
| Errors           | An envelope `{ ok, data \| error, changed }`. `IpcErrorCode = CoreErrorCode \| 'no_workspace_open' \| 'devbrain_unavailable' \| 'cancelled' \| 'internal'`. A `CoreError` keeps its message and its own fields; anything else becomes `internal` with a generic message. The router's `errorFormatter` puts this in the `data` of tRPC's error shape, so the renderer reads `err.data.code` on a `TRPCClientError`, typed.                            |
| Cancellation     | Only for an OAuth sign-in waiting on the browser: a dedicated `integrations.cancelConnect` mutation aborts the flow `connect` or `reconnect` started (one per workspace), and that call fails with `cancelled`. Nothing else is cancellable: database calls are synchronous, and provider calls time out on their own.                                                                                                                                |
| Data layer       | tRPC's React Query integration (`@trpc/tanstack-react-query`): `queryOptions`, `infiniteQueryOptions`, `mutationOptions`, `queryKey`, `pathKey` per route.                                                                                                                                                                                                                                                                                            |
| Change reporting | A `ChangeTracker` in main (`src/main/ipc/changes.ts`) subscribes to the open workspace's `onChange` streams and maps each change to `ChangedEntity[]`. Changes come only from core's services: procedures report nothing. Changes made during a mutation return in its response and go to the other windows as `db.changes`; everything else (sync, work a mutation left running) is batched per turn of the event loop and sent as one `db.changes`. |
| Invalidation     | A renderer-side `ENTITIES_READ_BY_ROUTE` table, saying which entities each router's queries read, and one `invalidateQueries` call with a predicate. A route not in the table refetches on any change, so a new route is never stale. The renderer neither coalesces nor defers: main batches background changes, and a mutation's own changes are refetched before it resolves.                                                                      |
| Push events      | Deltas only, as a plain broadcast on `ipc-event:<name>`, not tRPC subscriptions: they go to the whole app and take no input. The renderer refetches instead of applying snapshots. Sent today: `db.changes` and `workspace.changed`. Declared for status UI and not sent yet: `sync.progress`, `integrations.changed`, `sources.changed`.                                                                                                             |
| Windows          | One window for now. The tracker already sends each mutation's changes to the other windows, and `workspace.changed` to every window.                                                                                                                                                                                                                                                                                                                  |

## How it fits together

```
renderer                         preload                 main
─────────────────────────        ───────────────         ─────────────────────────────────────────
createTRPCClient<AppRouter>      bridge.invoke    ───►   attachRouter(appRouter): 'ipc:call'
  .tasks.updateStatus.mutate()   { path, type,             context: { devBrain, workspace, log }
  → ipcLink                ───►    input }                 mutation → changeTracker.trackMutation(
                                                             callTRPCProcedure: validate → middleware
                                                               → resolver)
                                                             resolver → workspace.tasks.updateStatus()
                                                               TaskService emits { type: 'updated' }
                                                                 ChangeTracker → mutation gets ['task']
  ipcLink ◄── { ok, data, changed: ['task'] } ◄──────────── response
  queryInvalidator.onChanged(['task'])
    → refetch mounted queries
    → then the mutation resolves

createEventClient<AppEvents>() ◄── bridge.subscribe ◄──── ChangeTracker: one 'db.changes' per turn
  → queryInvalidator.onChanged(...)                        (sync pages, work after a response)
```

Two flows, start to finish:

- **The user archives a task.** The transport runs the mutation through
  `changeTracker.trackMutation`, which calls `workspace.archive.archiveTask(id)`. `ArchiveService`
  archives the task and its linked note and emits `archived` with both ids. The `ChangeTracker`
  hears it while the mutation runs and adds `['task', 'note']`. The response carries
  `changed: ['task', 'note']`; the client invalidates the queries that read either, waits for the
  mounted ones to refetch, then resolves the mutation.
- **A Linear sync updates tasks.** The scheduler runs a sync, and `SyncEngine` commits a page and
  emits progress with `summary.changed: ['task', 'project']`. No mutation is running, so the
  `ChangeTracker` adds them to this turn's background batch, which goes out as one `db.changes`. The
  renderer invalidates, so a favorited synced task updates in the sidebar with no code written for
  that case.

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
  errors.ts                 IpcError, serializeError
  server.ts                 attachRouter: the transport over ipcMain
  context.ts                AppContext, createContext
  middleware.ts             logging, requireDevBrain, requireWorkspace
  zod.ts                    zId(entity), zPage
  changes.ts                ChangeTracker, and the entities of each core change
  routers/                  app, workspaces, settings, tasks, archive, favorites, notes, projects,
                            events, calendars, integrations, sources, sync, search
  router.ts                 appRouter, AppRouter

src/preload/index.ts        exposeBridge()

src/renderer/ipc/
  link.ts                   ipcLink (tRPC link: envelope, onChanged)
  bridge.ts                 the preload's bridge, read at call time
  events.ts                 createEventClient
  query-invalidator.ts      ENTITIES_READ_BY_ROUTE, createQueryInvalidator
  index.ts                  queryClient, events, queryInvalidator, ipc (createTRPCClient),
                            trpc (createTRPCOptionsProxy)
```

## The change tracker

Core already announces every change through `ChangeListeners`. The `ChangeTracker`
(`src/main/ipc/changes.ts`) decides only where each change goes: into the response of the mutation
that caused it, or into the background batch.

```
     workspace services' onChange / onProgress / onStatus
     (tasks, notes, projects, events, calendars, archive, favorites, search, detach,
      integrations, sync)
                                │
                                ▼
                 recordChange(entitiesOf…Change(change))
                                │
          inside a running mutation that hasn't answered? (AsyncLocalStorage)
             │ yes                                  │ no
             ▼                                      ▼
  add to that mutation's `changed`;     add to this turn's background batch;
  once it answers, send them to the     setImmediate sends the batch as one
  other windows as 'db.changes'         'db.changes' when the turn ends
```

- **Only mutations.** `attachRouter` runs each mutation through `trackMutation`. A query changes
  nothing, so it is not tracked; if one ever did write, its change would go out in the batch.
- **Only services.** Procedures have no `ctx.changes`. A write the renderer must hear about is
  announced by the service that makes it.
- **Attribution.** `ChangeListeners.emit` runs listeners synchronously in the async context of
  whatever caused the change, so `AsyncLocalStorage.getStore()` inside the listener returns the
  mutation responsible, if there is one, including after an `await` (a note file write).
- **Answered mutations.** Work that started inside a mutation but finishes later (a sync run
  started by a connect) carries the mutation's async context forward. Once the mutation has
  answered, its changes go in the background batch instead of being lost.
- **Batching per turn.** One write often emits several events in the same turn: the last sync page's
  progress, then the run's status. `setImmediate` waits until the turn's synchronous work and
  microtasks are done, so they go out together and the renderer refetches once. A microtask would
  fire before the status change; a timer would only add delay, since pages are separated by network
  fetches anyway.
- **Changes emitted inside a transaction** (`ArchiveChange`, `disconnected`). The listener runs
  before the commit, but the main process is single-threaded and the transaction synchronous: the
  response or batch cannot reach the renderer, nor its refetch run, until the commit is done.
- **Over-reporting is safe.** It only costs a refetch. When in doubt, a mapping returns more.

| Core change                         | `ChangedEntity[]`                                                    |
| ----------------------------------- | -------------------------------------------------------------------- |
| `TaskChange`                        | `task`                                                               |
| `NoteChange`                        | `note`                                                               |
| `ProjectChange`                     | `project`                                                            |
| `EventChange`                       | `event`                                                              |
| `CalendarChange`                    | `calendar`                                                           |
| `ArchiveChange`                     | each of `task`, `project`, `note` whose id list is not empty         |
| `FavoriteChange`                    | the favorited entity's type (`tasks` → `task`, …)                    |
| `SearchChange`                      | `note`; `rebuilt` → `task`, `project`, `note`, `event`               |
| `TaskLinkChange` (detach, reattach) | `task` plus its `changed`; `credentials_rejected` → `integration`    |
| `IntegrationChange`                 | `integration` and `externalSource`, plus `changed` on `disconnected` |
| `SyncProgress`                      | `summary.changed`                                                    |
| `SyncStatusChange`                  | `externalSource`                                                     |
| `WorkspaceChange`                   | `workspace`; `opened` and `closed` also send `workspace.changed`     |

`workspace.changed` (`id`, or `null` on close) goes to every window, the one whose mutation switched
too: it alone says which workspace is open. Main sends it while the mutation runs, before the
response, and the renderer resets on it; if it ever arrived after the response, the switching
window would show the old workspace's data for a moment before resetting. The status deltas the plan
also listed (`integrations.changed`, `sync.progress`, `sources.changed`) are declared in
`AppEvents` but not sent yet: they come with the status UI.

## Changes to core

Core stays free of IPC and Electron (`boundary.test.ts`). It gets seven small changes, all following
existing conventions:

1. **`WorkspaceService.onChange`**, built on `ChangeListeners`:
   `{ type: 'opened'; workspace: Workspace } | { type: 'closed'; workspaceId: WorkspaceId }`. It
   emits `opened` once the workspace is current and `closed` once it has closed. The change router
   follows the open workspace through it, including the one `openLastWorkspace` opens at launch.
2. **`SyncScheduler.onStatus`**, which passes on `SyncStateManager`'s `sync_status_changed`. Today
   nothing outside `Workspace`'s constructor can subscribe to source status.
3. **Move `integrations/shared-types.ts` to `src/common/integrations.ts`**, with a re-export in
   core, and point `boundary.test.ts` at the new location.
4. **Move the `CoreErrorCode` union to `src/common/errors.ts`.** `core/shared/errors.ts` imports it
   from there.
5. **`CalendarService.onChange`**: `setVisible` and `setSelected` send `{ type: 'updated'; calendar }`.
   Nothing announced them before, so hiding a calendar would have refreshed nothing.
6. **`WorkspaceService` sends `created`** once a new workspace is registered, so the workspace list
   refreshes without the route reporting it.
7. **`SearchService.onChange`**: the index writes that wait on note files, which finish after the
   change that caused them, send `notes_indexed` (a restored note's entry) or `rebuilt`. Without it
   an open search would miss a restored note until something else changed.

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
   - `createContext({ event })` is typed from the router. (Milestone 2 first passed a
     `changes.record()` recorder for resolvers to fill `changed`; the change tracking of milestone 3
     replaced it, so `changed` now comes from core's events alone.)
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
   first calls find the handler. (Milestone 3 attaches it once DevBrain is loaded, before the
   window is created.)

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

> **Status:** steps 1 and 6–8 landed in PRs 3 and 4. The change tracking of steps 2–5 landed in
> GitHub PR #56, with milestone 4, after a separate research pass
> (`docs/ipc/change-propagation-research.md`). It is built as the steps below describe, except: one
> `ChangeTracker` in `src/main/ipc/changes.ts` instead of a `changes/` folder; no `ctx.changes`, so
> a write that no service announced gets an `onChange` on its service instead; the status deltas
> are not sent yet; and the mappings are plain functions per change type rather than `assertNever`
> switches.

**Steps**

1. Make core changes 1 and 2 (`WorkspaceService.onChange`, `SyncScheduler.onStatus`), each with
   tests next to the existing ones.
2. **`ChangeTracker.trackMutation(window, onChange, run)`** runs a mutation inside an
   `AsyncLocalStorage` scope and gives `onChange` every entity core changes while it runs, on
   failure too. Once the mutation has answered, its scope stops collecting.
3. **The mappings** (`entitiesOfArchiveChange`, `entityOfFavoriteChange`,
   `entitiesOfTaskLinkChange`, `entitiesOfIntegrationChange`): see the table above.
4. **`ChangeTracker.watch(devBrain)`** subscribes to the current workspace now, then follows
   `workspaces.onChange`, subscribing on `opened`, unsubscribing on `closed`, and sending
   `workspace.changed`. Changes outside a mutation go in the background batch.
5. **The transport** passes each mutation to `changeTracker.trackMutation` and returns its
   `changed` on success and on failure; queries run untracked. (A tRPC middleware can't do this: it
   can only return the resolver's output, with no room for `changed` beside it.)
6. **Context and middleware** (tRPC middleware, built with `t.middleware`):
   - `createContext({ event, devBrain, log })` returns
     `{ event, devBrain, workspace: devBrain.currentWorkspace, log }`, read fresh on every call. `src/main/index.ts` binds the loaded DevBrain (or `null`) and the logger where it
     attaches the router. Startup's order (step 7) means no call arrives before DevBrain is
     loaded and the last workspace open, so there is nothing to wait for.
   - No sender guard: the window is sandboxed and can't open windows or navigate (step 7), so
     only the app's page can be in it to call main. (The plan first had a `senderGuard` checking
     each call's frame URL; milestone 3 dropped it as a second check of the same thing.)
   - `logging`: each call's path and duration at debug, never the input. A failure is logged once,
     by attachRouter's `onError` in `src/main/index.ts`, with the code the renderer gets: warn for
     an expected one, error (with the original) for `internal`.
   - `requireDevBrain` → `devbrain_unavailable` when DevBrain could not be loaded;
     `requireWorkspace` → that, or `no_workspace_open`. Each narrows the context.
   - Base procedures in `procedures.ts` (`trpc.ts` holds `t`, which the middleware imports), each
     for a query or a mutation: `publicProcedure`, `devBrainProcedure` (workspaces, settings) and
     `wsProcedure`. Routes never use `t.procedure`; `app.ping` and `app.version` are public ones.
   - `zId(entity)`, which checks the prefix with `isId` from `src/common/ids.ts`.
7. **`src/main/index.ts`:**
   - Startup is split in two (`src/main/runtime/start.ts`): `loadDevBrain` opens the DevBrain
     folder with no workspace open, and `openLastWorkspace` reopens the last one. `index.ts` runs,
     in order: load DevBrain; attach everything that follows it (the router, the quit hook, the
     focus and resume sync triggers); reopen the last workspace; create the window. Everything is
     attached before any workspace opens, and the window's first calls find the router and that
     workspace already open, so nothing passes a startup promise around. The `ChangeTracker`
     starts watching with the rest, before the last workspace opens. The
     quit hook calls `devBrain.close()`, which waits for a workspace still opening, as
     `WorkspaceService` queues its transitions.
   - Window hardening from `docs/security/untrusted-content.md`: `setWindowOpenHandler` → deny, and
     a `will-navigate` guard that cancels every navigation but a reload of the current page. The
     app routes within its page, which is no navigation.
8. **The first real routes:**
   - `workspaces`: `list`, `current`, `open`, `create`, `delete`. These return `WorkspaceInfo`,
     never a `Workspace`. `create` doesn't open the new workspace: core's `WorkspaceService.create`
     now registers it only once its database is created, closes that database and returns the
     info, so a workspace is only ever open through `open`, which closes the open one first (core's
     `WorkspaceService.switch`, which only called `open`, is gone). `open` writes
     `state.lastWorkspaceId`, which `openLastWorkspace` reopens at launch and nothing wrote before, and
     `delete` clears it.
   - `settings`: `get` returns the user's settings; `update` takes the whole settings object,
     validated by `appSettingsSchema` from `core/settings/schema.ts`, saves it and returns it. The
     app's state beside them in the settings file (`state`) has no route: only main uses it.
   - `workspace.openUrl`, which goes through core's `guardOpenExternal`.

**Tests** (`src/main/tests/ipc/changes.test.ts`, over a real DevBrain folder, with a fake
`sendToWindows`)

- Archiving a task with a linked note returns `changed` with `task` and `note`, sent only to the
  other windows.
- A note created after an `await` is in its mutation's `changed`.
- A mutation that throws after one committed write returns that write's entity in `changed`.
- Hiding a calendar returns `calendar`; a query that changes something is not tracked.
- Work a mutation left running is sent in the background once it has answered; a write made while a
  mutation waits stays out of its `changed`.
- Several background changes in one turn are sent as one `db.changes`; nothing is sent once the
  tracker stops watching.
- A switch sends `workspace.changed` and follows the new workspace; the switching mutation returns
  `workspace`; creating a workspace returns `workspace` without `workspace.changed`.

**Done when** the renderer can switch workspaces and see `workspace.changed`, and an archive's
response carries `changed`. Both are done.

## Milestone 4: React Query and invalidation

> **Status:** landed in GitHub PR #56. It is simpler than first planned: no `affects`/`compile`, no
> renderer-side coalescing or deferral, and no devtools yet.

**Steps**

1. Install `@tanstack/react-query` and `@trpc/tanstack-react-query`, which requires tRPC 11.22.1.
2. **`trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient })`** in
   `src/renderer/ipc/index.ts`. It gives each query `queryOptions`, `infiniteQueryOptions` and
   `queryKey`, each mutation `mutationOptions`, and each router `pathKey`. `infiniteQueryOptions`
   works on core's lists as they are: they take `cursor` and return `{ items, nextCursor }`. React
   Query's `signal` reaches the link and is ignored: no call is cancellable through it. `App.tsx`
   uses `useQuery` over the link, in the running app.
3. **`query-invalidator.ts`:**
   - `ENTITIES_READ_BY_ROUTE`: the entities each router's queries read, keyed by router, or by full
     path to override its router. Main says which entities changed, but the cache is keyed by
     route, and many views read entities other than their own (the calendar view filters on
     `calendars.visible`, project stats count tasks, favorites and search span everything), so the
     renderer needs this map from one to the other. A router missing from it refetches on every
     change.

     | Router                         | Reads                              |
     | ------------------------------ | ---------------------------------- |
     | `tasks`                        | `task`, `project`                  |
     | `projects`                     | `project`, `task`                  |
     | `notes`                        | `note`, `task`, `project`          |
     | `events`                       | `event`, `calendar`                |
     | `calendars`                    | `calendar`                         |
     | `favorites`                    | `task`, `project`, `note`, `event` |
     | `archive`                      | `task`, `project`, `note`          |
     | `search`                       | `task`, `project`, `note`, `event` |
     | `integrations`, `sync`         | `integration`, `externalSource`    |
     | `workspaces`                   | `workspace`                        |
     | `app`, `settings`, `workspace` | nothing                            |

   - `onChanged(entities)` invalidates every cached query whose route reads one of them, in one
     `invalidateQueries` call with a predicate on the path a tRPC query key starts with
     (`['tasks', 'get']`). React Query refetches the mounted ones; the promise resolves once they
     have.
   - **Workspace switch.** `workspace.changed` carries the open workspace's id. When it differs from
     the one whose data is cached, every query outside `app`, `settings` and `workspaces` is reset:
     `resetQueries` cancels what is in flight, clears the data and refetches what is mounted; the
     `workspaces` queries (which one is open) refetch too.
     `workspace` in a mutation's response, which a switch and a new workspace both report, only
     refetches the `workspaces` queries.

4. **`main.tsx`:** the `QueryClientProvider`, and `queryInvalidator.listen(events)` once. The link is
   built with `ipcLink({ onChanged: queryInvalidator.onChanged })`.

**Tests** (`src/renderer/tests/ipc/query-invalidator.test.ts`, Node, over a real `QueryClient`)

- `onChanged(['task'])` refetches active `tasks` and `favorites` queries, not `events` or `app`, and
  resolves once the refetches have landed.
- A calendar change refetches the calendar view; an inactive query is marked stale, not fetched; an
  unlisted route refetches on any change.
- A switch resets workspace data and keeps `settings`; the same workspace keeps everything; a
  mutation reporting `workspace` refetches only the workspace list.
- `listen` refetches on `db.changes`, resets on `workspace.changed`, and stops when told.

**Done when** a mutation and a `db.changes` event both refetch the right mounted queries. Both are
covered by tests; the end-to-end check in Electron so far is a workspace switch from a second window.

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
| `calendars`    | `list`, `setVisible`, `setSelected`                                                                                                                                                 | `CalendarService` announces both. `setSelected` also calls `workspace.sync.syncNow(sourceId)` when the calendar has a source.                                                                                   |
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
- A new entity type, if any, goes into `ChangedEntity`, the `ChangeTracker`'s mappings and
  `ENTITIES_READ_BY_ROUTE`.
- A router whose queries read entities other than its own gets a line in `ENTITIES_READ_BY_ROUTE`;
  without one it refetches on every change.

**Done when** every operation listed in `docs/integrations/tech-design.md` § "IPC contract" has a
route.

## Milestone 6: Documentation

1. Write `docs/ipc/design.md`, the reference for the layer as built, with a short "adding a route"
   checklist:
   - Add the procedure to its feature router, with an input schema.
   - Return what core returns.
   - If the service emits nothing for a write, add an `onChange` to the service, not the route.
   - Add the router to `ENTITIES_READ_BY_ROUTE` with the entities its queries read.
2. In `docs/integrations/tech-design.md`, replace "IPC contract (deferred)" with a pointer to the
   router and the `AppEvents` names.
3. In `docs/follow-ups.md`, close the calendar-selection sync item and the delta-vs-snapshot item
   for `IntegrationChange`.
4. Add a short "IPC" section to `CLAUDE.md`: core never imports from `src/main/ipc`; the renderer
   imports from `src/main` as a type only; handlers return core's data as it is; a new change type
   must be mapped in the `ChangeTracker`.

---

## Optimistic updates

An optimistic update patches the renderer's cache when the user acts, before the IPC call returns,
and is replaced by real data afterwards. These are written per interaction in the renderer; the
star toggle is the likely first one. The layer makes them safe:

- **What the layer guarantees.** A mutation resolves only after its `changed` has been refetched,
  so the swap from patch to real data has no gap. `changed` is returned on failure too, so whatever
  did commit is refetched.
- **What it doesn't.** Nothing defers a refetch while other mutations are pending, as first
  planned. With two mutations in flight, the first's refetch can briefly overwrite the second's
  patch until the second's own refetch lands. Add deferral when a view shows this.
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
| 4    | Milestone 3: context, middleware, window hardening, workspace/settings/openUrl routes (change router deferred)          | 2, 3                        |
| 5    | Milestone 4, with milestone 3's change tracking: GitHub PR #56                                                          | 4                           |
| 6a–c | Milestone 5: tasks + archive; integrations + sources + sync + calendars; notes + projects + events + favorites + search | 5                           |
| 7    | Milestone 6: documentation                                                                                              | 6                           |

## Out of scope

- **More than one window.** The tracker already sends each mutation's changes to the other
  windows; opening a second window is what remains.
- **tRPC subscriptions.** The push events go to the whole app and take no input, so a broadcast
  serves them. Subscriptions would need the transport to manage each one's lifetime (start, stop,
  cleanup when a window reloads or closes), as electron-trpc's `createIPCHandler` does; that is the
  model if a view ever needs a stream of its own.
- **Optimistic update helpers** (`patchTask` and similar), and client-generated ids for optimistic
  creates. Added per interaction once the UI exists.
- **The renderer's rendering rules** (Markdown, URLs, colours). These come from
  `docs/security/untrusted-content.md` when the views are built.
