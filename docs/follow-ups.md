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

_Found in feature 16b._

The mapper (`src/main/core/integrations/providers/google-calendar/mapper.ts`) colours an event from its `colorId`, through a fixed copy of Google's event palette, and falls back to the calendar's colour. Google's event resource now has `eventLabelId`, which supersedes `colorId` and refers to a label defined on the calendar (`calendars.get` → `labelProperties.eventLabels`). An event coloured through a label gets its calendar's colour instead. Reading labels needs one `calendars.get` per calendar, and the scope that allows it is still to check. The palette itself is also still from memory.

### Check that answering an invitation changes `updated`

_Found in feature 16b._

The writer skips an event whose `updated` is not newer than the stored one, which is how unchanged events cost no write. Google says `updated` covers "the main event data" and does not change for reminders. If answering an invitation does not change it either, a changed `response` (accepted to declined, say) would be skipped. One live check settles it: answer an invitation, then run an incremental sync and compare `updated`. If it does not change, compare `response` as well in the unchanged check for events.

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

_Found in PR #35._

A full pass lists the events that end after its `timeMin`, so it cannot tell an event deleted while the token was stale from one moved to before the window: both are left unlisted, and `PageWrite.sweepCalendar` removes both. A meeting moved more than a month back is lost from history instead of moved; it comes back if edited again. An event changed while the pass pages may also be left off every page, if Google's paging does not guarantee otherwise, and comes back with the next incremental sync.

Looking up each event the sweep would remove before removing it (`events.get`, one request each) would settle both: one that is deleted or cancelled goes, one that still exists is updated instead. The candidates are normally few. It needs a lookup on `CalendarSource`, the requests made before the last page is applied (pulls fetch, applies only write), and a read of the candidates through `SyncReader`. `TaskReconciler.resolveTasks` is the same pattern for tasks.

Whether any of this is needed rests on Google no longer reporting older deletions in a full listing with `showDeleted=true`, which its documentation implies but does not state. A live check (delete an event, then run a full listing some days later and see whether it still comes back as cancelled) would show how often a deleted event goes unreported at all.

### Reconnecting leaves kept tasks detached

_Found in feature 15. Done: a "reattach all" offer on the Integrations page, below._

After a disconnect that keeps local copies, connecting the same account again re-matches every link by provider and external id when the next sync sees the item (`PageWrite.findLinks` in `src/main/core/sync/writer.ts`). A project comes back synced, but a task stays detached, as it may hold edits made since. The disconnect now marks the task links it detaches (`KEPT_BY_DISCONNECT` in `src/main/core/integrations/schema.ts`), and once they are matched the account's card offers to reattach them (`integrations.reattachKept`, after a confirmation that local edits are replaced: every top-level kept task with its subtasks, from one provider lookup through `TaskReconciler.reattachGroups`) or keep them local (`integrations.keepKeptLocal`). Tasks the user detached themselves are never offered.

Left to do:

- **Copies kept before this change carry no marker**, so they are not offered; they can still be reattached one at a time.
- **The offer waits for the first sync.** A kept copy has no source until the sync lists its item, so the count grows as that sync runs. A copy whose item is no longer assigned to the user is never matched, so it is never offered either.
- **A refused task stays offered.** One that is gone or reassigned is reported and stays a kept copy, so the offer remains until the user picks Keep Local. Clearing the marker for a refusal that won't change (gone, reassigned) would end the offer by itself.

### Viewing months before the synced history

_Found while planning the calendar UI. Done: option 2, fetch on demand, below._

A Google calendar is mirrored from 30 days before its first full pass (`EVENT_HISTORY_WINDOW_MS`). When `EventService.listForCalendar` (IPC `events.listForCalendar`) reads a range that starts before what a selected, visible synced calendar has (`calendars.historyLoadedFrom`, else the window), `EventFetcher.fetchHistory` (`src/main/core/events/fetcher.ts`) lists the gap from the provider's calendar source (`timeMin`/`timeMax`, no sync token), saves each page through `SyncWriter.applyEventPage`, and lowers `historyLoadedFrom`; the read waits for that and returns the events. It goes through no sync run and leaves the cursor alone, and `EventService` announces it as `events_fetched`, so other views refetch. A fetch that fails is logged, records nothing, and is tried again by the next read. Deselecting a calendar clears `historyLoadedFrom` with its events. Local events take no part.

Left to do:

- **Changes to fetched events rely on Google's change feed covering them.** The events.list reference says a sync token returns "only entries that have changed since then", with no time filter, so changes to events before the first pass's `timeMin` should be reported, but this is unchecked against the live API. If they are not, fetched events stay as fetched.
- **The read waits for the whole fetch**, bounded only by `HTTP_TIMEOUT_MS` per page. A slow connection holds the view for as long.
- Two reads of the same old range at once both fetch it. Saves match by external id, so the result is the same.
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
