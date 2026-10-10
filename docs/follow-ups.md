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

`connected`, `status_changed` and `source_changed` are deltas: ids plus the one thing that changed, as the comment on `IntegrationChange` promises ("Ids and flags only"). `sync_status_changed`, added in feature 10, instead carries a full `ExternalSource` snapshot.

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

`IntegrationService` and `SyncEngine` each take the `ProviderRegistry` and the `CredentialStore` in their options. The service keeps both private, so the engine was given its own references rather than widening the service's API. Nothing guarantees the two were handed the same registry: if they were not, an integration would be connected through one provider and synced through another. The engine tests already build two separate registries (`fakeRegistry(...)` is called once for each), which only works because both hold the same provider object.

Options:

1. **The service hands the engine what it needs.** `getSyncTarget` also returns the resolved `TaskSource`, so the engine no longer takes the registry. Auth could move behind a service method the same way. Recommended for the registry at least, so the provider that connected an integration is always the one that syncs it.
2. **A narrow accessor** such as `IntegrationService.getProvider(id)`. Smaller, but exposes the registry anyway.
3. **Keep injecting both**, and have `Workspace` (feature 13) build each once and pass the same instances to both. This is ordinary dependency injection; the risk is only a wiring mistake.

### `SyncEntityType` is still a string union

_Found in feature 10 (PR #15)._

`SyncMode`, `SyncRunOutcome` and `SyncSkipReason` in `src/main/core/sync/types.ts` are string enums, matching `Provider`, `SourceType` and the other enums in `src/main/core/integrations/types.ts`. `SyncEntityType` (`'task' | 'project' | 'event' | 'calendar'`) in the same file is still a union. It comes from the writer (feature 9), so converting it means changing `src/main/core/sync/writer.ts` and its tests too. The values would stay the same, so progress events and anything forwarding them are unaffected.

### Share the gate and the lookup-and-apply path in `SyncEngine`

_Found in feature 12 (PR #17). Worth doing before another engine entry point is added, such as a per-task refresh._

`SyncEngine` (`src/main/core/sync/engine.ts`) has three entry points that talk to a task provider: `runSource`, `reconcileSource` and `reattachTasks`. Each repeats the same steps:

- **The gate:** `getSyncTarget`, then `skipReason`, then resolve the provider's `TaskSource` or skip as unsupported.
- **Auth:** `credentials.getAuth`, with rejected credentials moving the integration to `needs_reauth`. Runs do this through `recordFailure`. `reattachTasks` has its own `try`/`catch`.
- **Lookup then write:** reconcile calls `lookup` and then `writer.applyReconcile`. Reattach calls `lookup` and then `writer.reattachTasks`, which moves detached links to `synced`, promotes the subtasks left detached and upserts the page.

Proposal:

1. **A private `openTaskSource(sourceId)`** that returns `{ target, tasks }` or a `SyncSkipReason`, plus an auth helper that marks `needs_reauth` on `IntegrationAuthError`. All three entry points use it, so any new one gets the same rules for a source that is off, disabled, needs reauth, is rate limited or is unsupported.
2. **A public `refreshTasks(sourceId, externalIds)`** that looks the issues up and applies them through `writer.applyTaskPage`, which already handles updated, reassigned and gone issues. This would be a per-task "Sync now", for example a refresh button on the task detail. It isn't in the design: "Sync now" in `docs/integrations/tech-design.md` is per source, `runSource` then `reconcileSource` behind the scheduler's manual trigger. Adding it means a line in the design and a channel in the IPC list.
3. **Reattach as an option on that path:** `refreshTasks(sourceId, ids, { reattach: rootExternalId })`. The writer flips the detached links in the same transaction as the page apply. The only reattach-specific code left would be the root checks (gone, unassigned, unreadable) and the link-state change.

Items 1 and 3 are refactors with no change in behaviour, covered by the existing engine, reconcile and detach tests. Item 2 is a product decision.

### Start a sync when the calendar selection changes

_Found in feature 16b._

`IntegrationService.setCalendars` emits `calendars_changed` with the added and removed calendar ids. The scheduler (feature 13) does not listen for it yet, so an added calendar waits for the next interval or focus trigger. It should run the source when `added` is not empty. The `connected` event's missing `sourceType` (above) matters here too.

### A full resync of a calendar does not drop events deleted long ago

_Found in feature 16b._

After a 410, a calendar is walked again from 30 days back and its rows are matched by external id, as the design says. An event deleted while the token was stale that Google no longer reports as cancelled keeps its row. A sweep at the end of a full pass (delete this calendar's synced events not seen during the pass, by the removal rule) would close that; it needs the pass to record what it saw.

### Read `eventLabelId` for event colours

_Found in feature 16b._

The mapper (`src/main/core/integrations/providers/google-calendar/mapper.ts`) colours an event from its `colorId`, through a fixed copy of Google's event palette, and falls back to the calendar's colour. Google's event resource now has `eventLabelId`, which supersedes `colorId` and refers to a label defined on the calendar (`calendars.get` → `labelProperties.eventLabels`). An event coloured through a label gets its calendar's colour instead. Reading labels needs one `calendars.get` per calendar, and the scope that allows it is still to check. The palette itself is also still from memory.

### Check that answering an invitation changes `updated`

_Found in feature 16b._

The writer skips an event whose `updated` is not newer than the stored one, which is how unchanged events cost no write. Google says `updated` covers "the main event data" and does not change for reminders. If answering an invitation does not change it either, a changed `response` (accepted to declined, say) would be skipped. One live check settles it: answer an invitation, then run an incremental sync and compare `updated`. If it does not change, compare `response` as well in the unchanged check for events.

### Changing the mirrored event types needs a resync

_Found in feature 16b._

`MIRRORED_EVENT_TYPES` (`src/main/core/integrations/providers/google-calendar/requests.ts`) is sent as the `eventTypes` filter on every events request. Google requires the parameters of an incremental request to match the full pass that issued its sync token, so changing the list once users have synced needs their stored tokens cleared: a migration that empties the `calendars` of every Google events cursor, or a filter version kept in the cursor and compared on each pull. Making the list a per-source setting, so a user can opt into birthdays, would need the same.

### Disconnect has to handle synced calendars

_Found in feature 16b, for feature 15._

`calendars.sourceId` is set null when a source is deleted, which turns a synced calendar into a local one: its events become editable. That is right for "keep everything as local copies". For "remove synced items" (the default), disconnect should delete the source's calendars after removing their events, keeping a calendar only while events are kept in it (those a note or task links to). A calendar with events cannot be deleted (`events.calendarId` has no `ON DELETE`).

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
