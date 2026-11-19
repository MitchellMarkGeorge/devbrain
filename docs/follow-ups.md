# Follow-ups

Things to come back to: design questions left open, small inconsistencies and clean-ups that were out of scope when they were found. Each entry says where the code is, why it matters and the options considered, so it can be picked up without the original discussion.

Remove an entry once it is done or decided against, and note the decision in the commit that does it.

## Integrations and sync

### A per-task refresh, and reattach as an option on it

_Found in feature 12 (PR #17). Narrowed when every call to a provider went through `IntegrationService`._

Every entry point that talks to a provider for a source now goes through `IntegrationService` (`getSourceProvider`, `withSource`): the gate (`syncSkipReason`), the provider that connected the integration, auth, and `needs_reauth` on rejected credentials. A run (`SyncEngine`), a reattach (`TaskReconciler.reattachGroups`) and a history fetch (`EventFetcher`) follow the same rules. What is left is the write side:

- **Resolve then write:** reconcile calls `resolveTasks` and `resolveProjects` and then `writer.applyReconcile`. Reattach calls `resolveTasks` and then `writer.reattachTasks`, which moves detached links to `synced`, promotes the subtasks left detached and upserts the page.

Proposal:

1. **A public `refreshTasks(sourceId, externalIds)`** that resolves the issues through `IntegrationService.withSource` and applies them through `writer.applyTaskPage`, which already handles updated, reassigned and gone issues. This would be a per-task "Sync now", for example a refresh button on the task detail. It isn't in the design: "Sync now" in `docs/integrations/tech-design.md` is per source, `runSource` then `reconcileSource` behind the scheduler's manual trigger. Adding it means a line in the design and a route in the `sync` router. A product decision.
2. **Reattach as an option on that path:** `refreshTasks(sourceId, ids, { reattach: rootExternalId })`. The writer flips the detached links in the same transaction as the page apply. The only reattach-specific code left would be the root checks (gone, unassigned, unreadable) and the link-state change. A refactor with no change in behaviour, worth doing with item 1 rather than before it.

### Calendar changes wait for a sync run

_Found in feature 16b. Decided against for now (PR #187, closed): the visible effects are small._

Every calendar operation that needs the provider or the writer happens at the start of a run, in `EventSyncer`:

- **Deselecting a calendar removes its events when the run it starts reaches its first page, not at once.** The calendar view hides them at once (`EventService.listForCalendar` reads only selected synced calendars), so what lingers is their search entries, for a second or two online.
- **Refreshing the picker means running a sync.** New or renamed calendars appear when a run's listing stores them: every 5 minutes, on window focus, or after a manual sync.
- **A run that does not reach its first page does not clean up.** With the integration disabled or needing reauth, or offline, a deselected calendar's events stay stored and searchable, out of the calendar view, until a run gets that far.

PR #187 built `refreshCalendars` (list the calendars only) and `deselectCalendar` (remove the events and the cursor entry at once), and was closed as more machinery than these warrant. If the picker needs fresher calendars, the cheap fix is for Choose Calendars to call `sync.now({ sourceId })` when it opens. If search showing an unticked calendar's events matters, search can filter on `selected` as the calendar view does. Note for an immediate deselect, should it come back: a run already going when the calendar is deselected must leave the calendar's remaining pages unapplied and drop it from the cursor it saves, or selecting it again resumes incrementally without the removed events.

### Take the calendar reads out of `EventSyncer`

_Found in the source/syncer split. Subject to change: the current placement is a stopgap._

Syncers should not hold a database handle, but `EventSyncer` (`src/main/core/sync/event-syncer.ts`) takes one for two reads: which listed calendars a run syncs (`calendarsToSync`) and a calendar's row id for `SyncWriter.applyEventPage` (`rowIdOf`). They briefly lived in their own `CalendarSelection` class, which was too thin to justify on its own, and then in a `SyncReader` (PR #187, closed), which named a mechanism rather than a responsibility.

Options:

1. **The reads on `SyncWriter`**, which already reads constantly (links, parents, what links to an event, the sweep's own candidates) and is in practice sync's database layer. `applyEventPage` would take the calendar's external id and resolve the row itself, removing `rowIdOf`; the selection rule becomes a pure function `calendarsToSync(listed, rows)` over rows the writer hands back. About 50 test call sites pass a `CalendarId` today. Recommended.
2. **Through `CalendarService`.** Not recommended: services are the public interface for IPC, and the rule works on provider shapes (`ExternalCalendar`).

### A path for provider features that are not sync

_Found in feature 16b. Narrowed when `IntegrationService` became the one way to reach a provider._

Every provider feature so far is sync. The sources themselves know nothing of sync: `TaskSource` and `CalendarSource` take queries and return normalised items, with cursors, modes and windows in the syncers under `src/main/core/sync/`. A feature that is not sync now has a path, through `IntegrationService` alone:

- **A feature of a source type** (every events source, whatever its provider) uses `withSource(sourceId, type, call)` for one source or `forEachSource(type, call)` for all of them, and gets the type's part of each provider (`SourceParts` in `src/main/core/integrations/providers/provider.ts`). `EventFetcher` fetches calendar history this way.
- **A feature specific to one provider** (a GitHub pull request's checks) uses `withProvider(sourceId, Provider.X, call)`, and gets that provider's own implementation (`ProviderTypes` in `registry.ts`, each factory's return type).

Each checks the source first, gets fresh auth, and moves the integration to `needs_reauth` when the provider rejects the credentials.

Left to do, with the first such feature rather than guessing the shapes now:

1. **The capability itself:** an optional method on a source type's part (e.g. `CalendarSource.freeBusy?`), which every provider serving the type may implement, or a method on one provider's type for a provider-specific feature.
2. **A link lookup** from a local entity to its source, provider and external id. `src/main/core/integrations/refs.ts` already reads links; a feature on a task or event would start from it.

### Read `eventLabelId` for event colours

_Found in feature 16b. Checked against Google's reference (Nov 2026); waiting on a decision about a new OAuth scope._

The mapper (`src/main/core/integrations/providers/google-calendar/mapper.ts`) colours an event from its `colorId`, through a fixed copy of Google's event palette, and falls back to the calendar's colour. What the reference says:

- **The field.** `eventLabelId` is "the ID of an entry in the `labelProperties.eventLabels` property of the calendar (see the Calendars.get endpoint)" and "supersedes the index-based `colorId` property". An event coloured through a label gets its calendar's colour here instead.
- **The label.** `calendars.get` returns `labelProperties.eventLabels[]`, each with `id` (a UUID), `name` (optional, up to 50 characters) and `backgroundColor` (hex, required: "Events with this label are displayed in this color"). A calendar has at most 200. The calendar list (`calendarList`) does not carry them, so reading them costs one `calendars.get` per selected calendar.
- **The scope.** `calendars.get` needs `calendar.readonly`, `calendar`, `calendar.app.created`, `calendar.calendars` or `calendar.calendars.readonly`. DevBrain asks for `calendar.calendarlist.readonly` and `calendar.events.readonly`, neither of which allows it. The narrowest that does is `calendar.calendars.readonly` ("See the title, description, default time zone, and other properties of Google calendars you have access to"). Adding it changes the consent screen, may need Google's app verification again, and existing accounts would have to reconnect to grant it (`integrations.scopes` records what each granted, so labels could be read only where it was).
- **The palette.** `colors.get` is allowed by `calendar.calendarlist.readonly`, which DevBrain already has. Reading the event palette from it with the calendar list, instead of the copy from memory in `EVENT_COLORS`, needs no new scope.

To do once the scope is decided: read the labels with the calendar list (`CalendarSource.listCalendars`) onto `ExternalCalendar` for integrations that granted the scope, keep them on the calendar row, and resolve an event's colour from its label when it has one, `colorId` otherwise.

### Changing the mirrored event types needs a resync

_Found in feature 16b._

`MIRRORED_EVENT_TYPES` (`src/main/core/integrations/providers/google-calendar/requests.ts`) is sent as the `eventTypes` filter on every events request. Google requires the parameters of an incremental request to match the full pass that issued its sync token, so changing the list once users have synced needs their stored tokens cleared: a migration that empties the `calendars` of every Google events cursor, or a filter version kept in the cursor and compared on each pull. Making the list a per-source setting, so a user can opt into birthdays, would need the same.

### A full pass after a 410 leaves cancelled occurrences as recorded

_Found in PR #35._

After a 410, a calendar's full pass removes the synced events it did not list: those whose link's `lastSyncedAt` is older than the pass's start (`PageWrite.sweepCalendar` in `src/main/core/sync/writer.ts`). Cancelled occurrences have no such time, so they are left as recorded, in `event_exceptions` and, for a series not mirrored yet, `external_event_exceptions`. An occurrence cancelled and then restored unchanged while the token was stale stays hidden. One restored with changes comes back as an occurrence row and shows; a parked one for a series that never arrives is invisible. How often Google restores an occurrence unchanged (an undo, the bin, an edit of the whole series) is not confirmed.

Options:

1. **`lastSyncedAt` on both cancellation tables**, written when a cancellation is recorded or listed again. The sweep then also forgets, for the series the pass listed, the cancellations in the window older than its start. The same rule as links; a migration of two nullable `ADD`s, where an empty value counts as not seen. It puts a sync column on `event_exceptions`, which local series are to use too, though the sweep only touches synced series.
2. **The pass's cancellations in the cursor**, as `series@start` keys next to `startedAt`, compared at the end. No schema change, and cancellations in the window are few, but the cursor grows while the pass pages and is rewritten with every page, and it is a second mechanism next to `lastSyncedAt`.

### Ask the provider about events a full pass would remove

_Found in PR #35. Decided against for now: a token goes stale rarely, and an event moved more than a month back during that gap more rarely still._

A full pass lists the events that end after its `timeMin`, so it cannot tell an event deleted while the token was stale from one moved to before the window: both are left unlisted, and `PageWrite.sweepCalendar` removes both. A meeting moved more than a month back is lost from history instead of moved; it comes back if edited again. An event changed while the pass pages may also be left off every page, if Google's paging does not guarantee otherwise, and comes back with the next incremental sync.

Looking up each event the sweep would remove before removing it (`events.get`, one request each) would settle both: one that is deleted or cancelled goes, one that still exists is updated instead. The candidates are normally few. It needs a lookup on `CalendarSource`, the requests made before the last page is applied (pulls fetch, applies only write), and a read of the candidates in `EventSyncer`, which `Take the calendar reads out of EventSyncer` above wants to move. `TaskReconciler.resolveTasks` is the same pattern for tasks.

Whether any of this is needed rests on Google no longer reporting older deletions in a full listing with `showDeleted=true`, which its documentation implies but does not state. A live check (delete an event, then run a full listing some days later and see whether it still comes back as cancelled) would show how often a deleted event goes unreported at all.

### To confirm against the live Google Calendar API

_From working through the calendar entries. Each was checked against Google's reference (Nov 2026) and is tested with recorded responses; none against the live API. What the reference settles is marked; what is left needs a real account._

- **A full listing has every cancelled occurrence of the series it lists.** Settled by the reference, which makes option 1 of "A full pass after a 410 leaves cancelled occurrences as recorded" safe: `events.list` says cancelled instances of recurring events are included even when `showDeleted` and `singleEvents` are both false (DevBrain sends `showDeleted=true` with `singleEvents=false`), and the events resource tells clients to "store these events for the lifetime of the parent recurring event", so they are not purged while the series lives.
- **Answering an invitation and `updated`.** Not settled: `updated` is the "last modification time of the main event data", and only reminders are named as not changing it. The writer compares the calendar's own `response` as well as `updated`, so an answer is written either way. If a live check shows answering does move `updated`, the extra read (`storedResponses` in `src/main/core/sync/writer.ts`) can go.
- **A full listing does not keep every deletion.** Settled: deleted events "will eventually disappear", so a full pass after a 410 can miss them, as `sweepCalendar` assumes. It cannot tell those from events moved to before its window either (see "Ask the provider about events a full pass would remove").
- **The event types filter and sync tokens.** Settled: `eventTypes` is not among the parameters refused with a `syncToken`, and "all other query parameters should be the same as for the initial synchronization to avoid undefined behavior". That is why changing the list needs a resync (see "Changing the mirrored event types needs a resync").

### Reconnecting leaves kept tasks detached

_Found in feature 15. Done: a "reattach all" offer on the Integrations page (PR #159), below._

After a disconnect that keeps local copies, connecting the same account again re-matches every link by provider and external id when the next sync sees the item (`PageWrite.findLinks` in `src/main/core/sync/writer.ts`). A project comes back synced, but a task stays detached, as it may hold edits made since. The disconnect marks the task links it detaches (`KEPT_BY_DISCONNECT` in `src/main/core/integrations/schema.ts`), and once they are matched the account's card offers to reattach them (`integrations.reattachKept`, after a confirmation that local edits are replaced: every top-level kept task with its subtasks, from one provider lookup through `TaskReconciler.reattachGroups`) or keep them local (`integrations.keepKeptLocal`). Tasks the user detached themselves are never offered. A task refused for good (its issue gone, or assigned to someone else) is no longer offered once Reattach All has reported it, as if kept local; one refused for a passing reason (its source switched off, a rate limit) stays offered.

Left to do:

- **Copies kept before the marker carry none**, so they are not offered; they can still be reattached one at a time. Nothing tells them apart from tasks the user detached, so this is left as it is.
- **The offer waits for the first sync.** A kept copy has no source until the sync lists its item, so the count grows as that sync runs. A copy whose item is no longer assigned to the user is never matched, so it is never offered either. Offering earlier would need the disconnect to remember the account (the marker holds no account), so a reconnect of that account could match its kept copies before syncing.

### Viewing months before the synced history

_Found while planning the calendar UI. Done: option 2, fetch on demand, below._

A Google calendar is mirrored from 30 days before its first full pass (`EVENT_HISTORY_WINDOW_MS`). When `EventService.listForCalendar` (IPC `events.listForCalendar`) reads a range that starts before what a selected, visible synced calendar has (`calendars.historyLoadedFrom`, else the window), `EventFetcher.fetchHistory` (`src/main/core/events/fetcher.ts`) lists the gap from the provider's calendar source (`timeMin`/`timeMax`, no sync token), saves each page through `SyncWriter.applyEventPage`, and lowers `historyLoadedFrom`; the read waits for that and returns the events. It goes through no sync run and leaves the cursor alone, and `EventService` announces it as `events_fetched`, so other views refetch. A fetch that fails is logged, records nothing, and is tried again by the next read. Deselecting a calendar clears `historyLoadedFrom` with its events. Local events take no part.

Left to do:

- **Changes to fetched events rely on Google's change feed covering them.** The events.list reference says a sync token returns "only entries that have changed since then", with no time filter, so changes to events before the first pass's `timeMin` should be reported, but this is unchecked against the live API (see "To confirm against the live Google Calendar API" above). If they are not, fetched events stay as fetched.
- **The read waits for the whole fetch**, bounded only by `HTTP_TIMEOUT_MS` per page. A slow connection holds the view for as long. Answering from the database at once and announcing the fetch afterwards (`events_fetched` already refetches every view) would end the wait, at the cost of a frame without the old events.
- **Overlapping reads each list their range.** A fetch lists from the read's start up to what the calendar already has, so reads in flight at once overlap: opening the calendar on an old month reads that month (the loader) and, at once, the month before (`usePrefetchRanges`), and both list the months between it and the window. Saves match by external id, so the result is the same; the cost is the duplicate requests, and only for reads before the window. Sharing an in-flight fetch with a read it covers only catches the later read reaching back no further, not this case: that needs the further-back fetch to list only the part not already being fetched, then wait for the rest.
- `historyLoadedFrom` only goes down while the calendar is selected. Nothing trims old history again.

## Editor

### Entity pills and the "@" menu show default glyphs and stored titles

_Found in the rich text editor (PR #101)._

The editor knows an entity only by its type, id and title, so the pills in a note didn’t show its real state. (The "@" menu does now: each search result carries the entity it found, and `toEditorEntity` in `src/renderer/shared/hooks/use-workspace-editor-host.ts` reads its status and colour from it.)

**Done (milestone 5): `useEditorEntity`** (`src/renderer/shared/hooks/use-editor-entity.ts`), which each page editor's pill calls (`WorkspaceEntityPill`, the `entityPill` that `WorkspaceRichTextEditor` gives `RichTextEditor`): a `useQuery` on `tasks.get`, `projects.get`, `notes.get` or `events.get`, one query per pill, which the query invalidator refetches when core reports a change, so the pill draws again when its query settles; an entity known to be gone (it returns null) gets the "missing" style. A batch route (`entities.summaries(ids)`, or a document's `mentions`) can come later if notes with many pills make the per-pill queries noticeable; it would fill those same queries' cache, so the pills would not change.

Colours from core are untrusted (docs/security/untrusted-content.md): parse them with `hexColorSchema` before they reach a style, falling back to the default when they fail.

## Workspaces

### Workspaces used in place, and bringing one back

_Found while adding "Open folder…"._

`WorkspaceService.import` copies the folder picked into the DevBrain folder (see [moving between computers](workspaces/moving-between-computers.md)). The Figma Welcome screen shows workspaces at paths such as `~/Documents/Side projects`, which suggests workspaces that live where the user put them. Doing that needs:

- `delete` to stop removing a folder outside `workspaces/` (remove it from the list only, or ask), since today it removes the workspace directory recursively.
- A decision on folders inside sync tools (Dropbox, iCloud): a live SQLite database with its WAL can be corrupted when a sync tool copies it mid-write.

Separately, bringing a workspace back to a computer that still lists it is refused as `already_added`. A "Replace" choice (close it, swap in the folder, keep its registry entry) would make round trips one step.

## Routing

### Ask Electron whether the window can go back or forward

_Found in the routing work (PR #130)._

`useHistoryPosition` (`src/renderer/shared/hooks/use-history-position.ts`) decides whether the window bar's arrows (and Back on a failed open) are enabled from TanStack Router's history: the entry's `__TSR_index` against `router.history.length`. It avoids TanStack's `useCanGoBack`, which is experimental and has no forward counterpart, but `__TSR_index` is still TanStack's own field: typed in `@tanstack/history`'s `ParsedHistoryState`, not described in its docs. `src/renderer/tests/routing/tanstack-behaviour.test.ts` checks how it counts, so an upgrade that changes it fails there.

Electron knows for certain: `webContents.navigationHistory.canGoBack()` and `canGoForward()` (Electron 42). Main already follows the window's navigations (`did-navigate`, `did-navigate-in-page`, in `src/main/runtime/last-page.ts`), so it could send an event such as `navigation.changed { canGoBack, canGoForward }` after each, and the hook would read that instead.

- For: exact, documented and stable, and nothing from TanStack's internals.
- Against: a new event in `src/common/events.ts`, sent on every navigation, and the arrows update a moment after the page (the answer comes from main). The renderer tests' fake main (`src/renderer/tests/routing/fake-main.ts`) would have to send it too. It sends two booleans, not the location, so the rule against sending the location over IPC still holds.
- To check: that `navigationHistory` counts a hash change as an entry, as the router does, and what it reports after a reload.

## Deleting

### Rename archive to trash in code

_Found while adding permanent delete._

The UI now calls archiving "moving to trash", and permanent delete is only offered on the Trash
page. The code still says archive: `ArchiveService`, the `archive` router (`archiveTask`,
`listArchived`, …), `archivedAt`, `AlreadyArchivedError`/`NotArchivedError` and the `not_archived`
code the deletes use. Renaming them touches the schema's column names (a rename migration) and every
caller, so it was left for its own change.
