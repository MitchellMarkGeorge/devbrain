# Follow-ups

Things to come back to: design questions left open, small inconsistencies and clean-ups that were out of scope when they were found. Each entry says where the code is, why it matters and the options considered, so it can be picked up without the original discussion.

Remove an entry once it is done or decided against, and note the decision in the commit that does it.

## Integrations and sync

### Log listener failures in `IntegrationService` through a logger

_Found in feature 10 (PR #15)._

`IntegrationService.emit` (`src/main/core/integrations/service.ts`) catches a change listener that throws and reports it with `console.error`. In the app that goes to stderr, not the log file, and tests have to stub `console` to keep it quiet. `SyncEngine` had the same pattern and now logs through an injected logger instead: one `error`-level line naming the error class only, since a listener's message could quote account or item data.

- Give `IntegrationServiceOptions` an optional `logger`, defaulting to `electron-log`'s `log.scope('integrations')`, and log `Integration change listener threw change=<type> error=<ErrorClass>`.
- Move `SyncLogger` (`src/main/core/sync/engine.ts`) to a neutral place such as `src/main/core/shared/logger.ts`, so the service and the engine share one logger type and the service does not import from `sync/`.
- `stripMarkdown` (`src/main/core/shared/markdown.ts`) also uses `console.error`, if the same rule should apply everywhere in core.

### Make the `IntegrationChange` payloads consistent

_Found in feature 10 (PR #15). Worth settling before the scheduler (feature 13) subscribes to these events._

`connected`, `status_changed` and `source_changed` are deltas: ids plus the one thing that changed, as the comment on `IntegrationChange` promises ("Ids and flags only"). `sync_status_changed`, added in feature 10, instead carries a full `ExternalSource` snapshot. (Since feature 16b it comes from `SyncStateManager` in `src/main/core/sync/sync-state.ts`, which owns the sync state on `external_sources`, not from `IntegrationService`; a listener that wants both subscribes to both.)

- It mixes two conventions, so a listener has to handle both, and the comment on the type is no longer true.
- Its top-level `sourceId` always equals `source.id`.
- `source.lastError` is a free-text error message. The engine keeps error messages out of the log because they can quote a provider's response, but this one reaches every listener and, through IPC later, the renderer.
- The IPC contract in `docs/integrations/tech-design.md` uses snapshots (`'integrations:changed': Integration`, `'sources:changed': ExternalSource`), so whichever convention core settles on decides whether the IPC layer forwards events as they are or looks each one up.

Options:

1. **All deltas.** `sync_status_changed` becomes `{ integrationId, sourceId, ok, lastSyncedAt, retryAt }`, and anything that needs the error text or the whole source calls `getById`. Keeps free text off events and leaves the snapshot question to the IPC layer. Recommended.
2. **All snapshots.** Every event carries the `Integration` or `ExternalSource` it changed, matching the IPC contract. Touches feature 7's events and tests.
3. **Keep the snapshot and only drop the duplicate `sourceId`.** Smallest change, but leaves the mixed convention.

Two smaller points about the same events:

- `connected` lists its sources as `{ sourceId, enabled }` with no `sourceType`, so once there are events sources the scheduler needs a lookup to tell a tasks source from an events source.
- One action can emit several events in a row: `setEnabled` sends `status_changed` and then a `source_changed` per toggled source, and a rejected key sends `sync_status_changed` and then `status_changed`. Each is accurate, but a listener reacting to the first cannot tell more are coming.

### One owner for the provider registry and credential store

_Found in feature 10 (PR #15)._

`IntegrationService`, `SyncEngine` and `TaskReconciler` each take the `ProviderRegistry` and the `CredentialStore` in their options. The service keeps both private, so the engine was given its own references rather than widening the service's API. Nothing guarantees the two were handed the same registry: if they were not, an integration would be connected through one provider and synced through another. The engine tests already build two separate registries (`fakeRegistry(...)` is called once for each), which only works because both hold the same provider object.

Options:

1. **The service hands the engine what it needs.** `getSyncTarget` also returns the resolved `TaskSource`, so the engine no longer takes the registry. Auth could move behind a service method the same way. Recommended for the registry at least, so the provider that connected an integration is always the one that syncs it.
2. **A narrow accessor** such as `IntegrationService.getProvider(id)`. Smaller, but exposes the registry anyway.
3. **Keep injecting both**, and have `Workspace` (feature 13) build each once and pass the same instances to both. This is ordinary dependency injection; the risk is only a wiring mistake.

Feature 13 did option 3 for now: `createIntegrationServices` returns the registry it built, and `Workspace` hands that and the same `CredentialStore` to `SyncEngine`. Options 1 and 2 still remove the possibility of a wiring mistake.

### Let an aborted sync cancel a token refresh

_Found in feature 13._

An aborted sync run cancels its provider requests: every `TaskSource` and `CalendarSource` method takes an optional `signal`, which the clients combine with `HTTP_TIMEOUT_MS` (`requestSignal` in `src/main/core/integrations/fetch.ts`). The one request it does not reach is an OAuth token refresh inside `CredentialStore.getAuth`, which a run makes before its first page when the access token is about to expire. That refresh is shared: refreshes of one integration are queued, and a caller that waited in the queue uses the tokens the refresh before it stored, so one caller's abort must not cancel a refresh another is waiting on. A `Workspace.close()` that lands during a refresh therefore still waits for it, up to 30 seconds.

- Give `getAuth` an optional `signal` that stops the caller waiting without cancelling the shared refresh, so the refresh finishes and stores its tokens for the next caller. The run then ends at once; the refresh's own write lands later, so `close()` would also need to wait for refreshes in flight, or the store would need to check the connection is still open before writing.

### `SyncEntityType` is still a string union

_Found in feature 10 (PR #15)._

`SyncMode`, `SyncRunOutcome` and `SyncSkipReason` in `src/main/core/sync/types.ts` are string enums, matching `Provider`, `SourceType` and the other enums in `src/main/core/integrations/types.ts`. `SyncEntityType` (`'task' | 'project' | 'event' | 'calendar'`) in the same file is still a union. It comes from the writer (feature 9), so converting it means changing `src/main/core/sync/writer.ts` and its tests too. The values would stay the same, so progress events and anything forwarding them are unaffected.

### Share the auth path and the resolve-and-apply path for tasks

_Found in feature 12 (PR #17). Narrowed when reconcile and reattach moved into `TaskReconciler`. Worth doing before another entry point is added, such as a per-task refresh._

Three entry points talk to a task provider: `SyncEngine.runSource` and `SyncEngine.reconcileSource` (through `TaskSyncer`), and `TaskReconciler.reattachTasks` (`src/main/core/sync/task-reconciler.ts`). The gate is shared: each calls `syncSkipReason` (`src/main/core/sync/sync-state.ts`). Two steps are still repeated:

- **Auth:** `credentials.getAuth`. Runs move the integration to `needs_reauth` on rejected credentials through the engine's `recordFailure`; `reattachTasks` leaves that to its caller (see the next item). `reattachTasks` also resolves the provider's `TaskSource` itself.
- **Resolve then write:** reconcile calls `resolveTasks` and `resolveProjects` and then `writer.applyReconcile`. Reattach calls `resolveTasks` and then `writer.reattachTasks`, which moves detached links to `synced`, promotes the subtasks left detached and upserts the page.

Proposal:

1. **One helper that opens a source for a call outside a run:** returns `{ target, tasks, auth }` or a `SyncSkipReason`, and marks `needs_reauth` on `IntegrationAuthError`. Any new entry point then gets the same rules for a source that is off, disabled, needs reauth, is rate limited or is unsupported. It could also be the `withConnection` path in "A path for provider features that are not sync" below.
2. **A public `refreshTasks(sourceId, externalIds)`** that resolves the issues and applies them through `writer.applyTaskPage`, which already handles updated, reassigned and gone issues. This would be a per-task "Sync now", for example a refresh button on the task detail. It isn't in the design: "Sync now" in `docs/integrations/tech-design.md` is per source, `runSource` then `reconcileSource` behind the scheduler's manual trigger. Adding it means a line in the design and a channel in the IPC list.
3. **Reattach as an option on that path:** `refreshTasks(sourceId, ids, { reattach: rootExternalId })`. The writer flips the detached links in the same transaction as the page apply. The only reattach-specific code left would be the root checks (gone, unassigned, unreadable) and the link-state change.

Items 1 and 3 are refactors with no change in behaviour, covered by the existing engine, reconcile and detach tests. Item 2 is a product decision.

### Start a sync when the calendar selection changes

_Found in feature 16b._

`CalendarService.setSelected` only flips the `selected` column: a selected calendar gets its first pass, and a deselected one's events are removed, at the next sync run of its source (`EventSyncer`). Nothing triggers that run yet, so the change waits for the next interval or focus trigger. The IPC handler for `calendars:setSelected` should ask the scheduler (feature 13) for a run of the calendar's source right after the change; so should a "refresh" in the calendar picker. There is no change event to listen for: the handler has the calendar, and its `sourceId`, already.

### Calendar changes wait for a sync run

_Found in feature 16b. Not a priority._

Feature 16b moved the calendar work out of `IntegrationService` so that services only read and write the database and `SyncWriter` stays inside `src/main/core/sync/`. Every calendar operation that needs the provider or the writer now happens at the start of a run, in `EventSyncer`. That changed some behaviour:

- **Deselecting a calendar removes its events at the next run, not at once.** Until then they stay in the calendar view.
- **Refreshing the picker means running a sync.** New or renamed calendars appear when the run's listing stores them; the run's result has `'calendar'` in `changed`.
- **There is no `calendars_changed` event.** `IntegrationService.setCalendars` emitted one; the caller of `CalendarService.setSelected` now knows what changed and notifies the renderer and the scheduler itself.
- **A run that does not reach its first page does not clean up.** The clean-up is written with the run's first page, so with the integration disabled or needing reauth (the run is skipped), or offline (it fails before a page), a deselected calendar's events stay until a run gets that far.

If any of these matters in the calendar UI, `EventSyncer` can expose two operations beside `start`, keeping both rules:

- **`refreshCalendars(sourceId, auth)`**: list the account's calendars and store them with `SyncWriter.applyCalendarList`, without pulling events. One request, for the picker.
- **`deselectCalendar(sourceId, calendarId)`**: unselect the calendar, remove its events with `SyncWriter.removeCalendarEvents` and drop its entry from the source's cursor, in one transaction. `EventSyncer` owns the cursor's shape (`src/main/core/sync/event-cursor.ts`), so it can drop the entry itself. Database only, so it works offline and while the integration needs reauth.

The picker's IPC handlers would call them through whatever owns the syncers (the engine, or the scheduler). Selecting a calendar would stay `CalendarService.setSelected` followed by a run.

### Take the calendar reads out of `EventSyncer`

_Found in the source/syncer split. Subject to change: the current placement is a stopgap._

Syncers should not hold a database handle, but `EventSyncer` (`src/main/core/sync/event-syncer.ts`) takes one for two reads of the calendars table: which listed calendars a run syncs (`calendarsToSync`), and a calendar's row id for `SyncWriter.applyEventPage` (`rowIdOf`). They briefly lived in their own `CalendarSelection` class, which was too thin to justify on its own.

Options:

1. **A `SyncReader`**, the read side of `SyncWriter`: every read sync makes, namely the calendar rows and `rowIdOf` (and `TaskReconciler`'s `planReconcile`, which takes a database handle for the same reason). Syncers get a writer and a reader, never a handle, and the selection rule becomes a pure function `calendarsToSync(listed, rows)` testable without a database. Recommended.
2. **The reads on `SyncWriter`**, with `applyEventPage` taking the calendar's external id and resolving the row itself, which removes `rowIdOf`. Fewest moving parts, but stretches the writer into all of sync's database access, and about 50 test call sites pass a `CalendarId` today.
3. **Through `CalendarService`.** Not recommended: services are the public interface for IPC, and the rule works on provider shapes (`ExternalCalendar`).

### A path for provider features that are not sync

_Found in feature 16b._

Every provider feature so far is sync. Since the source/syncer split, the sources themselves know nothing of sync: `TaskSource` and `CalendarSource` take queries and return normalised items, with cursors, modes and windows in the syncers under `src/main/core/sync/`. So a source can already serve a caller outside sync, as `scripts/linear_scratch.mts` does. Reading something on demand, such as a Linear issue's comments or a GitHub pull request's checks, still has no obvious place:

- The provider contract (`src/main/core/integrations/providers/provider.ts`) has only `getAccount`, `tasks?: TaskSource` and `calendars?: CalendarSource`.
- There is no public way to get a provider with working auth. The engine and `TaskReconciler` assemble it privately from the registry and `CredentialStore`, with their own needs-reauth handling.

Proposal:

1. **Optional capabilities on `Provider`** beside the sync sources, each a small typed interface under the same stateless rule, e.g. `pullRequests?: PullRequests` or `issueDetails?: IssueDetails`.
2. **`IntegrationService.withConnection(integrationId, call)`:** runs `call({ provider, auth })` with fresh auth, and moves the integration to `needs_reauth` on a rejected call. It is the one path for any caller, the engine included.
3. **A link lookup** from a local entity to its integration, provider and external id. `src/main/core/integrations/refs.ts` already reads links; it would also return the integration id.
4. **One service per feature, in its own module,** using 1–3. For example, a pull request service resolves a task's link, then calls `provider.pullRequests.get(auth, url)` through `withConnection`. A new feature is then a capability interface, its implementation in the provider's folder, and that service. `IntegrationService`, `SyncEngine` and `SyncWriter` do not change.

Design it properly with the first such feature, rather than guessing the capability shapes now.

### Read `eventLabelId` for event colours

_Found in feature 16b._

The mapper (`src/main/core/integrations/providers/google-calendar/mapper.ts`) colours an event from its `colorId`, through a fixed copy of Google's event palette, and falls back to the calendar's colour. Google's event resource now has `eventLabelId`, which supersedes `colorId` and refers to a label defined on the calendar (`calendars.get` → `labelProperties.eventLabels`). An event coloured through a label gets its calendar's colour instead. Reading labels needs one `calendars.get` per calendar, and the scope that allows it is still to check. The palette itself is also still from memory.

### Check that answering an invitation changes `updated`

_Found in feature 16b._

The writer skips an event whose `updated` is not newer than the stored one, which is how unchanged events cost no write. Google says `updated` covers "the main event data" and does not change for reminders. If answering an invitation does not change it either, a changed `response` (accepted to declined, say) would be skipped. One live check settles it: answer an invitation, then run an incremental sync and compare `updated`. If it does not change, compare `response` as well in the unchanged check for events.

### Changing the mirrored event types needs a resync

_Found in feature 16b._

`MIRRORED_EVENT_TYPES` (`src/main/core/integrations/providers/google-calendar/requests.ts`) is sent as the `eventTypes` filter on every events request. Google requires the parameters of an incremental request to match the full pass that issued its sync token, so changing the list once users have synced needs their stored tokens cleared: a migration that empties the `calendars` of every Google events cursor, or a filter version kept in the cursor and compared on each pull. Making the list a per-source setting, so a user can opt into birthdays, would need the same.

### Find a way to record a full pass's listing without a scratch table

_Found in PR #35._

After a 410, a calendar's full pass removes the synced events it did not list (`PageWrite.sweepCalendar` in `src/main/core/sync/writer.ts`). To know what it listed across pages, each page writes rows to `external_full_pass_listed` (`src/main/db/schema/integrations.ts`) under the pass's id from the events cursor, and the last page deletes them. It works, but it is a whole table, plus a migration, for data that only exists while a pass pages, and the Google id of each listed event is held twice meanwhile.

Whatever replaces it has to keep what the current version guarantees: the record commits with its page and cursor, survives a restart mid-pass, nothing is removed after an incomplete pass (abort, failure, `MAX_PAGES_PER_RUN`), and removal stays within the pass's window and follows the removal rule.

Options considered so far:

- A `seen_in_pass` column on `external_links`, `event_exceptions` and `external_event_exceptions` (the PR's first commit). No extra table, but the column sits on links of tasks and projects that never use it, and the marks stay on the rows after the pass.
- The listed ids in the cursor. Commits with the page, but the cursor is rewritten on every page and the list grows with the calendar.
- Keeping the ids in memory and sweeping only when a whole pass ran in one run. No storage, but an interrupted pass never cleans up.
- Wiping the calendar when the pass starts, as Google's sync guide says to. Deleting a row clears `notes.linkedEventId` and `tasks.linkedEventId` at once (`set null`), so every linked note loses its event, and events older than the window are lost for good.
- A general `working_sets` table for durable working state. Cleaner if a second job needs it, but still a separate table.
- Not yet tried: `external_links.lastSyncedAt`, which every upsert and touch already moves. A pass could store its start time in the cursor and sweep links not synced since. It needs no new storage, but a clock that moves backwards could remove listed events, `PageWrite` takes its time from `new Date()` rather than the syncer's injected clock, and it covers links only, not `event_exceptions` or parked cancellations.

Also worth settling first whether the fix is needed: it rests on Google no longer reporting older deletions in a full listing with `showDeleted=true`, which its documentation implies but does not state. A live check (delete an event, then run a full listing some days later and see whether it still comes back as cancelled) would show how often a deleted event can actually go unreported.

### A reconnect overwrites a disable made while it runs

_Found in PR #31, where reconnecting started syncing again._

`IntegrationService.reconnect` (`src/main/core/integrations/service.ts`) reads the integration's status, awaits `authenticate` (one account query for an API key, the whole browser flow for OAuth, which can take minutes) and sealing the credentials, then writes the new status. It chooses that status from the row it read before the wait: disabled stays disabled, anything else becomes connected. A `setEnabled(id, false)` that lands during the wait is overwritten:

| Step                              | Status       | Source | Event                                             |
| --------------------------------- | ------------ | ------ | ------------------------------------------------- |
| `reconnect` reads the row         | needs_reauth | on     |                                                   |
| the user disables the integration | disabled     | off    | `needs_reauth → disabled`, `source_changed` (off) |
| `reconnect` writes                | connected    | off    | `needs_reauth → connected`                        |

- The user's disable is lost, and the integration shows connected with every source off, which only a user's own choice otherwise produces.
- The event's `previous` is the stale status, so a listener tracking status from events gets a wrong history.
- Nothing syncs, but only because every source is off. If reconnect ever switched sources back on, it would sync what the user just turned off.

A disconnect during the wait is already safe: `CredentialStore.save` throws `NotFoundError` and the transaction rolls back. Moving to `needs_reauth` during the wait and then being overwritten with connected is correct, as the new credentials were just validated.

Fixes, which can be combined:

1. **Re-read the status in the write transaction** and choose the new status and `previous` from it. The transaction is synchronous, so nothing can change between the read and the write. A few lines plus a test that holds the account query open and disables meanwhile. Recommended in any case.
2. **Refuse edits while a flow runs.** Track the integrations being connected or reconnected, and make `setEnabled` and `setSourceEnabled` throw an "integration busy" error for them. The service already does this between OAuth flows (`connecting` and `ConnectInProgressError`), but API-key reconnects are not tracked. Gives the UI a clear error when a click slips through.
3. **Lock the controls in the UI.** While an integration connects or reconnects, its enable toggle and source switches are disabled ("Waiting for sign-in…"). The clearest experience, but not enough on its own: `markNeedsReauth` also comes from the sync engine and token refresh, and a second window or a stale view can still reach the service. Nothing in the renderer or IPC calls `reconnect` or `setEnabled` yet, so this belongs with the integrations settings screen.

### Reconnecting leaves kept tasks detached

_Found in feature 15._

After "keep everything as local copies", connecting the same account again re-matches every link by provider and external id when the next sync sees the item (`PageWrite.findLinks` in `src/main/core/sync/writer.ts`), so nothing is duplicated. The link's state then rules as for any link: a project or calendar comes back synced (a project was detached automatically, so it is reattached automatically), a removed item is restored, but a task stays detached until the user reattaches it, as a detached task may hold edits made since the disconnect.

- That is safe, but after reconnecting the user has every old task as a local copy and has to reattach each one. The UI could offer "reattach all" after a reconnect: `DetachService.reattachTask` per top-level task, which refreshes it from the provider and overwrites local edits after a confirmation.
- Or disconnect could mark the links it detached (a `detachedBy` on the link, or a metadata key), so a later sync reattaches those and leaves the ones the user detached alone. That needs a migration and a rule for a copy edited after the disconnect.

### The calendar view's FullCalendar adapter

_Found in feature 16b, for the calendar UI._

The event model stores what FullCalendar needs; the renderer still has to map each `Event` from `EventService.listForCalendar` to FullCalendar's event input. [The adapter spec](calendar/fullcalendar-adapter.md) covers the mapping. In short: one-off events map directly; a series' `rrule` is a string of `DTSTART`, its `recurrenceRule` and its `exdates` as `EXDATE` lines (FullCalendar's `exdate` property only works with an object `rrule`); occurrence rows are events of their own, grouped with their series. It also lists what to confirm against FullCalendar, chiefly `TZID` support.

## Events

### Deleting one occurrence, or this and following, of a local series

_Found in feature 16b, for the calendar UI._

`EventService.deleteEvent` on a series deletes the master and its occurrence rows: Google's "All events". Google also offers "This event" and "This and following events", which local series will need once the calendar UI can edit them:

- **This event**: add an `event_exceptions` row for the occurrence's start, or, if it has an occurrence row, delete that row (its `originalStartAt` already keeps the slot out of `exdates`).
- **This and following**: end the series before the occurrence by adding `UNTIL` to its `RRULE` line, and delete its occurrence rows and `event_exceptions` rows from that start on.

Neither is reachable yet: `CreateEventOptions` and `UpdateEventOptions` take no `seriesId` or `originalStartAt`, so only sync creates occurrence rows, and synced events are read-only.

When local occurrence rows exist, `deleteEvent` should also follow the removal rule for them. Today it deletes every occurrence row of the series, and a note linked to one only loses its link. The schema's intent (`events.seriesId` is set null when its series goes) is that an occurrence a note or task links to survives as a one-off: delete the unlinked occurrence rows, and keep the linked ones with `seriesId` cleared.
