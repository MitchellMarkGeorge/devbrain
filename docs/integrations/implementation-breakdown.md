# Implementation breakdown

This build covers the core only: 15 features in 5 milestones, all under `src/main/core` plus a small amount of main-process wiring, with Vitest coverage. IPC and UI are out of scope. IPC will be built separately with a dedicated typed solution, and the UI comes later.

## Overview

| #   | Feature                                               | Milestone               | Depends on |
| --- | ----------------------------------------------------- | ----------------------- | ---------- |
| 1   | Nullable due dates and null-aware pagination          | 1 Foundations           |            |
| 2   | CANCELLED task status                                 | 1 Foundations           |            |
| 3   | Integration tables, ids and errors                    | 1 Foundations           |            |
| 4   | External refs on read models                          | 1 Foundations           | 3          |
| 5   | Read-only guards and local tasks in mirrored projects | 1 Foundations           | 4          |
| 6   | Credential storage                                    | 2 Connections           | 3          |
| 7   | IntegrationService and Linear API key connect         | 2 Connections           | 6          |
| 8   | Linear client and mapper                              | 3 Linear sync           | 2          |
| 9   | SyncWriter                                            | 3 Linear sync           | 1, 4       |
| 10  | SyncEngine: initial and incremental                   | 3 Linear sync           | 7, 8, 9    |
| 11  | Reconcile, watched set and project lifecycle          | 3 Linear sync           | 10         |
| 12  | Detach and reattach                                   | 3 Linear sync           | 10         |
| 13  | SyncScheduler and workspace wiring                    | 4 Runtime               | 10         |
| 14  | Main-process wiring                                   | 4 Runtime               | 7, 13      |
| 15  | Disable, disconnect and re-authentication             | 4 Runtime               | 12, 13     |
| 16  | Provider-agnostic OAuth with PKCE, Google Calendar    | 5 OAuth and Google      | 10         |
|     | Typed IPC channels                                    | Deferred, separate work |            |
|     | UI                                                    | Deferred                |            |

Features 1, 2 and 3 have no dependencies and can be built in any order or in parallel. Feature 16 is two sub-features: a provider-agnostic OAuth module and Google Calendar. Linear OAuth is deferred.

**Repo changes since the design was written.** Three things in `main` affect the plan:

- **Keyset pagination landed** (`core/shared/pagination.ts`). `listTasks` and `listProjects` now page by `(sortColumn, id)`. The `keyset` helper assumes the sort value is never null, so nullable `dueDate` needs a null-aware variant. This is new work inside feature 1.
- **Migrations run to `0015`.** The integration migration is `0016` or later.
- **`tests/db/pagination-indexes.test.ts` asserts which index each list query uses.** Any index added or changed by these features must be reflected there.

**Conventions used below.** Each feature lists its steps in build order, the tests to write, and a done-when line. Tests follow the existing pattern: `createDb()` from `core/tests/utils.ts`, real services, in-memory SQLite. One commit or small PR per feature.

**Where the reference material is.** The design tab holds the shared type definitions, state transitions, error handling table and constants ("Core types and rules"), and the verified endpoints, headers, limits and query shapes for each provider ("Provider reference"). Steps below point to them instead of repeating them.

## Milestone 1: Foundations

Five features that change existing code so mirrored rows can exist. Nothing here talks to a provider.

### 1. Nullable due dates and null-aware pagination

Linear issues and projects often have no due date. This is the riskiest change to existing code, so it goes first and alone.

- [ ] In `core/tasks/types.ts` and `core/projects/types.ts`, change `dueDate: Date` to `Date | null` on `Task` and `Project`. Leave `CreateTaskOptions.dueDate` and `CreateProjectOptions.dueDate` required.
- [ ] Run `npm run typecheck` and fix every error the type change surfaces before touching the schema.
- [ ] In `db/schema/tasks.ts` and `db/schema/projects.ts`, remove `.notNull()` from `dueDate`.
- [ ] Run `npm run db:generate-migrations`. Read the generated SQL: it must rebuild both tables, copy all rows, and recreate every index and check constraint.
- [ ] Extend `keyset` in `core/shared/pagination.ts` with a `nullable` option. Order by `(col IS NULL), col, id` so nulls come last in both directions. Let `lastSortValue` in the cursor be null. Resume clause: after a non-null value, include rows with greater values, ties with greater id, and all null rows; after a null value, include only null rows with greater id.
- [ ] Pass `nullable: true` from `listTasks` and `listProjects` when sorting by `dueDate`.
- [ ] In `createSubtask`, keep inheriting the parent's `dueDate`; if both are null, throw, because local tasks require one.
- [ ] In `getProjectStats`, count a task as overdue only when `dueDate` is not null.
- [ ] Check `dueBefore`, `dueAfter` and `dueOn` filters: SQL comparisons already exclude nulls. Add a test that proves it.
- [ ] Update `tests/db/pagination-indexes.test.ts` for the due-date sort. If the `IS NULL` ordering stops the planner using `idx_tasks_due_date_id`, add an expression index on `(due_date IS NULL, due_date, id)` and assert that instead.

**Tests**

- [ ] Pagination: a list mixing dated and undated tasks pages correctly in both directions, with no row skipped or repeated across the null boundary.
- [ ] Pagination: a cursor whose last value is null resumes correctly.
- [ ] Migration: seed a database at migration `0015`, migrate, and compare row counts, index names and check constraints.
- [ ] Stats: an undated incomplete task is not overdue.

**Done when** the full suite passes and no existing test needed its expectations weakened.

### 2. CANCELLED task status

- [ ] Add `CANCELLED = 4` to `TaskStatus` in `core/tasks/types.ts`.
- [ ] Confirm `updateStatus` leaves `completedAt` null for CANCELLED, which keeps `completed_at_consistency` true.
- [ ] Add `numOfCancelled` to `ProjectStats`. Exclude cancelled tasks from `totalTasks` and from overdue, so progress is completed over non-cancelled.
- [ ] Decide and encode how `showCompletedTasks` treats cancelled tasks: hidden together with completed ones.
- [ ] Check every `switch` or comparison on `TaskStatus` across core for a missing case.

**Tests**

- [ ] A task can move to CANCELLED and back; `completedAt` stays null throughout.
- [ ] Project stats with a mix of all four statuses.
- [ ] `listTasks({ status: TaskStatus.CANCELLED })` returns only cancelled tasks.

**Done when** a local task can be cancelled through `TaskService` and stats stay correct.

### 3. Integration tables, ids and errors

- [ ] In `src/common/ids.ts`, add entity types `integration` (`int`), `externalSource` (`src`) and `externalLink` (`xln`), with `IntegrationId`, `ExternalSourceId` and `ExternalLinkId` exports.
- [ ] Create `db/schema/integrations.ts` with `integrations`, `external_sources` and `external_links`, as specified in the data model section. Include `settledAt` on links.
- [ ] Add the constraints: unique `(provider, accountId)`; unique `(integrationId, sourceType)`; unique `(sourceId, externalId)`; unique on each of `taskId`, `projectId`, `eventId`; the `CHECK` that exactly one of the three is set.
- [ ] Set foreign keys: source to integration cascades; link to source sets null; link to entity cascades.
- [ ] Add an index on `external_links (sourceId, state)` for the reconcile query.
- [ ] Generate the migration. It can share a file with feature 1 or follow it.
- [ ] In `core/shared/errors.ts`, add `ExternalReadOnlyError` and `IntegrationAuthError`.
- [ ] Create `core/integrations/types.ts`: `Provider`, `SourceType`, `AuthType`, `IntegrationStatus`, `LinkState`, `Integration`, `ExternalSource`, `ExternalRef`.

* [ ] Also add `RateLimitError` (carries `retryAt`) and `ProviderUnavailableError` to `core/shared/errors.ts`, per the error handling table.
* [ ] Add `ExternalTask`, `ExternalProject`, `ExternalEvent`, the cursor and config types, and zod schemas for the cursor, config and link metadata JSON, as defined in "Core types and rules".
* [ ] Create `core/sync/constants.ts` with the values from the constants table.

**Tests**

- [ ] A link with zero or two entity columns is rejected by the check.
- [ ] Deleting a task deletes its link; deleting an integration deletes its sources and nulls `sourceId` on its links.
- [ ] Two links with the same `(sourceId, externalId)` are rejected.

**Done when** the migration applies to a fresh and to a seeded database.

### 4. External refs on read models

- [ ] Add `external?: ExternalRef | null` to `Task`, `Project` and `Event`.
- [ ] Write one shared helper, `core/integrations/refs.ts`, that takes entity ids and returns a map of id to `ExternalRef`. Use it after each list query rather than joining inside every query; this keeps the keyset queries and their indexes untouched.
- [ ] Call the helper from `getById`, `getByIds`, `listTasks`, `listSubtasks`, `listProjects`, `listEventsInRange`.
- [ ] Add `origin?: 'local' | 'external'` to `TaskFilterOptions` and `ProjectFilterOptions`, implemented with `EXISTS` on `external_links` where state is `synced`.
- [ ] Make `listEventsInRange` exclude events whose link state is `removed`.

**Tests**

- [ ] A task with a `synced` link returns `external` with provider, key, url and labels; a local task returns null.
- [ ] `origin` filter returns each side correctly; a `detached` task counts as local.
- [ ] Pagination still returns stable pages with the `origin` filter applied.

**Done when** every read path returns `external` and the index test still passes.

### 5. Read-only guards and local tasks in mirrored projects

- [ ] Add `assertEditable(entityId)` to the refs helper: throws `ExternalReadOnlyError` when the link state is `synced`.
- [ ] `TaskService`: guard `updateTask`, `updateStatus`, `updateProject`, `promoteSubtask`, `demoteTask` (both ids) and `createSubtask` (parent).
- [ ] `TaskService.updateLinks`: allow on synced tasks. Skip the "subtasks inherit links" rejection when the task is external.
- [ ] `TaskService.updateProject` and `createTask`: allow a local task to target a mirrored project.
- [ ] `ProjectService`: guard `updateProject` and `updateStatus`.
- [ ] `EventService`: guard `updateEvent` and `deleteEvent`.
- [ ] `ArchiveService`: reject `archiveTask` and `archiveProject` on synced rows. Leave restore alone; `SyncWriter` restores through its own path.
- [ ] Make sure the subtask depth checks in `createSubtask` and `demoteTask` run only for local tasks, so deep external trees never trip them on read.

**Tests**

- [ ] Each guarded method throws on a `synced` row and succeeds on the same row once `detached`.
- [ ] A local task can be created in and moved into a mirrored project, and shows in its stats.
- [ ] A note can be linked to a synced task; a synced event can receive a linked note.

**Done when** no service method can change a provider-owned field on a synced row.

## Milestone 2: Connections

A workspace can hold a validated, encrypted Linear connection. Nothing syncs yet.

### 6. Credential storage

- [ ] Define `SecretCipher` in `core/integrations/credentials.ts`: `isAvailable(): Promise<boolean>`, `encrypt(plain: string): Promise<Buffer>`, `decrypt(cipher: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>`. It mirrors Electron's async `safeStorage` API.
- [ ] Define the `Credentials` union: `{ type: 'api_key'; apiKey }` and `{ type: 'oauth'; accessToken; refreshToken; expiresAt }`. Validate with zod on decrypt.
- [ ] Implement `CredentialStore` in `core/integrations/credential-store.ts` with `seal(credentials)`, `save(integrationId, sealed)`, `getAuth(integrationId)` and `clear(integrationId)`. It reads and writes `integrations.credentials`. Encryption is async and a better-sqlite3 transaction is not, so `seal` encrypts before the transaction and the synchronous `save` writes inside it.
- [ ] When `decrypt` reports `shouldReEncrypt`, re-encrypt and store the credentials under the new key.
- [ ] `getAuth` returns the header value a provider needs. For OAuth it refreshes when the token expires within 60 seconds. Leave the refresh call as an injected function per provider; it is implemented in feature 16.
- [ ] Add a per-integration in-memory mutex so two callers never refresh at once.
- [ ] Refuse `save` when `isAvailable()` is false, with an error the UI can show.
- [ ] Write `tests/__mocks__/fake-cipher.ts`: a reversible fake for tests.
- [ ] Make sure no credential field is ever passed to `electron-log`. Automatic redaction is deferred; see the `Secret` wrapper under open questions in the design.

**Tests**

- [ ] Round trip: save, read back, equal.
- [ ] The stored blob does not contain the plain key.
- [ ] `save` throws when the cipher is unavailable.
- [ ] A corrupt blob raises `IntegrationAuthError`, not a crash.

**Done when** credentials can be stored and read only through `CredentialStore`.

### 7. IntegrationService and Linear API key connect

- [ ] Define the `Provider` interface in `core/integrations/providers/provider.ts`, as in the architecture section, including `listAssignedIds` and `lookup`.
- [ ] Create a provider registry: a map from provider id to implementation, passed into `IntegrationService` so tests can register a fake.
- [ ] Create `providers/linear/client.ts` with a minimal GraphQL-over-`fetch` helper: injected `fetch`, auth header, error mapping for 401, 429 and GraphQL errors. This is a client for Linear's API only.
- [ ] Implement `linear.getAccount(auth)` with a `viewer` query returning id, name and email.
- [ ] Implement `IntegrationService.connectWithApiKey(provider, apiKey)`: validate through `getAccount`, insert the integration, save credentials, and create one `external_sources` row per supported source type with `enabled: true`. All in one transaction after the network call.
- [ ] Reject a second connection for the same `(provider, accountId)` with a clear error.
- [ ] Implement `list()`, `getById()`, `setEnabled(id, enabled)` and `setSourceEnabled(sourceId, enabled)`.
- [ ] Emit a typed in-process event (`EventEmitter` or a small callback set) on any integration or source change. The scheduler and the IPC layer subscribe later.
- [ ] Construct `IntegrationService` in `Workspace`, taking `SecretCipher`, `fetch` and the provider registry through `Workspace.open` and `Workspace.create` options.
- [ ] Thread those options down from `DevBrain` and `WorkspaceService`.

* [ ] Build the Linear `accountId` as `<organizationId>:<userId>` and the label as "name, organisation"; the `viewer` query must also select the organisation.
* [ ] Send a Linear API key as `Authorization: <key>` with no `Bearer` prefix.
* [ ] Give every request a 30-second timeout through `AbortSignal`.

**Development shortcut**

- [ ] `DEV_LINEAR_API_KEY` is in `.env.template` (added). Copy it into the git-ignored `.env` with a personal key.
- [ ] In `scripts/setup_dev_workspace.mts`, when the variable is set, call `connectWithApiKey('linear', key)` on the dev workspace so a seeded workspace starts connected.
- [ ] Use the same variable in the scratch scripts for features 8 and 10, and to gate any live-API test so the suite skips it when the variable is absent.
- [ ] Read the variable only in dev scripts and tests, never in `src/main`. The app itself always takes the key through the connect flow and stores it encrypted.

**Tests**

- [ ] Valid key: integration and its tasks source exist; credentials are encrypted.
- [ ] Invalid key (401): nothing is written.
- [ ] Duplicate account: rejected.
- [ ] Disabling the integration or a source flips the flag and emits the event.
- [ ] Two workspaces: connecting in one leaves the other empty.

**Done when** a real Linear API key connects from a scratch script or the dev seed script, and the row survives a restart.

## Milestone 3: Linear sync

The core of v1. At the end, calling one method mirrors a real Linear account into a workspace database and keeps it current.

### 8. Linear client and mapper

- [ ] Before writing queries, verify against Linear's API documentation: the filter syntax for assignee, state type, `updatedAt` and id lists; pagination arguments; rate-limit headers; how archived and trashed issues are requested. These are the open provider questions in the design.
- [ ] Record real responses from a test Linear workspace into `tests/integrations/fixtures/linear/`. Scrub names and emails.
- [ ] Write one issue fragment with every mirrored field: id, identifier, url, title, description, state name and type, priority and its label, due date, started and completed times, created and updated times, parent id and title, project id, assignee id, archived and trashed markers.
- [ ] Write one project fragment: id, name, description, url, state, start date, target date, colour, updated time.
- [ ] Implement `tasks.pull(auth, cursor, config)`. Initial mode: assigned to viewer, open or closed within 30 days. Incremental mode: assigned to viewer, updated after the cursor. Page size 50, ordered by `updatedAt`.
- [ ] Implement `tasks.listAssignedIds(auth)`: ids only, open issues, paged to the end.
- [ ] Implement `tasks.lookup(auth, ids)`: batches of 100, including archived; returns found issues and the ids that did not resolve.
- [ ] Write `providers/linear/mapper.ts`: `toExternalTask` and `toExternalProject`. Status by state type, priority by number, raw labels into metadata, per the mapping tables in the design.
- [ ] Define the cursor shape `{ mode: 'initial' | 'incremental'; after?: string; updatedSince?: string }` and keep it opaque outside the provider.

* [ ] Start from the query shapes in the provider reference: `viewer.assignedIssues` with `orderBy: updatedAt` and `includeArchived: true`.
* [ ] Detect rate limiting from the body: HTTP 400 with `extensions.code` equal to `RATELIMITED`. Throw `RateLimitError` with `retryAt` from `X-RateLimit-Requests-Reset`.
* [ ] Map network failures, timeouts and 5xx responses to `ProviderUnavailableError`.
* [ ] Parse the date-only `dueDate` as local midnight.
* [ ] Set `assignedToViewer` on every mapped task by comparing the assignee id with the account's user id.

**Tests**

- [ ] Mapper: one fixture per state type, including cancelled; one per priority; with and without due date, project and parent.
- [ ] Client: a scripted `fetch` returns two pages, then done; cursor advances correctly.
- [ ] Client: 401 maps to `IntegrationAuthError`; a 400 with code RATELIMITED maps to RateLimitError with the reset time.
- [ ] `lookup` splits 250 ids into three requests and reports unresolved ids.

**Done when** a scratch script prints the normalised tasks and projects for a real account.

### 9. SyncWriter

The only code that writes external rows. It bypasses the service guards on purpose and never touches DevBrain-owned fields.

- [ ] Create `core/sync/writer.ts` with `applyTaskPage(sourceId, { projects, tasks, removedIds })`. One SQLite transaction per call.
- [ ] Upsert projects first. Look up by `(sourceId, externalId)`; insert the project and link, or update provider-owned fields when `externalUpdatedAt` changed.
- [ ] Sort tasks so parents precede children within the page. For a child whose parent is not mirrored, leave `parentTaskId` null and store the parent key and title in link metadata.
- [ ] Upsert tasks by the link-state table in the design: insert; touch `lastSyncedAt` only; update; skip `detached`; restore `removed`.
- [ ] On update, write only: title, description, status, priority, start and due dates, parent, project, `completedAt`. Never write `linkedNoteId`, `linkedEventId` or `favoritedAt`.
- [ ] Set `createdAt` from the provider on insert. Skip the row update entirely when nothing changed, so `updatedAt` does not move.
- [ ] Resolve a deferred parent: when a parent arrives in a later page, re-parent children that recorded its external id in metadata.
- [ ] Clear `settledAt` on any link that receives an update.
- [ ] Implement `removeTasks(sourceId, externalIds)`: set `archivedAt`, link state `removed`, `removedAt`.
- [ ] Call `SearchService.indexTasks` and `indexProjects` for inserted and changed rows. Add a `removeFromIndex(entityIds)` method to `SearchService` if one does not exist, and call it for removed rows.
- [ ] Return a summary: counts of inserted, updated, removed, and which entity types changed.

**Tests**

- [ ] Insert, then the same page again: second run writes nothing and `updatedAt` is unchanged.
- [ ] Changed title updates the row; a linked note and favourite survive.
- [ ] Child before parent in one page, and child and parent in different pages, both end correctly nested.
- [ ] Three levels of sub-issues nest fully.
- [ ] An orphan issue later gains a project: the project is created and the task moves.
- [ ] A detached task is not updated; a removed task that reappears is restored.
- [ ] Search finds a mirrored task by title and stops finding it once removed.
- [ ] A failure midway through a page rolls the whole page back.

**Done when** every row in the link-state table has a passing test.

### 10. SyncEngine: initial and incremental

- [ ] Create `core/sync/engine.ts` with `runSource(sourceId, { signal })`.
- [ ] Load the source and integration; return early when either is disabled or in `needs_reauth`.
- [ ] Get auth from `CredentialStore`. Loop: `pull`, `applyTaskPage`, save the new cursor. Save the cursor in the same transaction as the page.
- [ ] On the last initial page, set `initialSyncCompletedAt` and switch the cursor to incremental mode, with `updatedSince` set to the highest `updatedAt` seen minus 60 seconds.
- [ ] After each successful run, set `lastSyncedAt`, clear `lastError`, reset `consecutiveFailures`.
- [ ] On failure, record `lastError` and increment `consecutiveFailures`. On `IntegrationAuthError`, set the integration to `needs_reauth`.
- [ ] Check the `AbortSignal` between pages and stop cleanly.
- [ ] Emit a progress callback after each page with the writer's summary.
- [ ] Write `tests/sync/fake-provider.ts`: scripted pages, failures and delays.

* [ ] Validate the stored cursor with zod; if it does not parse, treat it as null and start a fresh initial sync.
* [ ] When one item fails to map or validate, skip it, count it in the run summary and continue the page. Only a database error fails the page.
* [ ] On `RateLimitError`, end the run and store `retryAt` so the scheduler does not retry earlier.
* [ ] Log one line per run through `electron-log`: source, mode, pages, counts, duration, outcome. No titles, descriptions or credentials.

**Tests**

- [ ] Three-page initial sync mirrors everything and ends in incremental mode.
- [ ] A throw on page two keeps page one and its cursor; the next run resumes at page two.
- [ ] Incremental run with no changes writes only `lastSyncedAt`.
- [ ] 401 moves the integration to `needs_reauth`; the next run returns early.
- [ ] Abort between pages leaves a consistent database.

**Done when** `runSource` against real Linear mirrors the account, and a second call picks up an edit made in Linear.

### 11. Reconcile, watched set and project lifecycle

- [ ] Add `reconcileSource(sourceId, { signal })` to the engine.
- [ ] Step 1: `listAssignedIds`.
- [ ] Step 2: select watched links: state `synced`, `settledAt` null, local task not completed or cancelled. Candidates are those absent from the snapshot.
- [ ] Step 2b: in the other direction, take snapshot ids with no `synced` link (link `removed`, or no link at all; skip `detached`) as returning issues. Restoring an issue from the trash clears `archivedAt` and leaves `updatedAt` unchanged (seen on a live account), so incremental sync never sees it and only this check brings it back.
- [ ] Step 3: `lookup` the candidates and returning issues. Found and still assigned: upsert (covers completed and cancelled, and restores a `removed` link). Found but reassigned: remove. Not found: remove.
- [ ] Step 4: settle. Set `settledAt` on synced links whose task was completed or cancelled more than 30 days ago.
- [ ] Step 5: project lifecycle. For each mirrored project with no synced tasks, or that `lookup` reports deleted: detach it if it holds local or detached tasks, otherwise archive it and mark the link `removed`.
- [ ] Step 6: when a project is detached, clear `projectId` on any still-synced task in it only if Linear now reports a different or no project; the upsert in step 3 normally does this already.
- [ ] Auto-reattach: in `SyncWriter`, when a project arrives whose link is `detached`, set it back to `synced` and refresh provider-owned fields.
- [ ] Extend the Linear provider's `lookup` to accept project ids.
- [ ] Set `lastReconciledAt` on success.

**Tests**

- [ ] Reassigned issue: archived, link `removed`.
- [ ] Deleted issue (does not resolve): same.
- [ ] Completed in Linear between incremental runs: status updated, not removed.
- [ ] Issue closed 31 days ago becomes settled and is no longer a candidate.
- [ ] Settled issue is reopened: incremental sync updates it and clears `settledAt`.
- [ ] Project with only a local task left is detached and editable; project with nothing left is archived.
- [ ] Detached project's Linear project returns: reattached, no duplicate, local task still inside.
- [ ] Issue restored from the trash, with `updatedAt` unchanged: its `removed` link is restored and the task unarchived on the next reconcile.
- [ ] No candidates and no returning issues: `lookup` is never called.

**Done when** unassigning an issue in Linear removes it locally on the next reconcile.

### 12. Detach and reattach

- [ ] Add `detachTask(id)` to a new `core/integrations/detach.ts` or to `IntegrationService`. Set the link and the links of its whole subtree to `detached`, in one transaction.
- [ ] Add `reattachTask(id)`: require a connected, enabled source; `lookup` the single issue; fail clearly if it no longer resolves; set state `synced`; apply the fresh data through `SyncWriter`.
- [ ] Reattaching a parent reattaches its detached subtree in the same call.
- [ ] Confirm that a detached task with nested children does not trip the local depth guards on later edits.
- [ ] Reject `reattachTask` while the task, or any task in its detached subtree, has local subtasks, with a message to promote or move them first. A synced task never has local children, and `removeTasks` archives only the task itself, so a reattached parent would leave such children live under an archived row.
- [ ] Archive and restore a detached task's whole subtree. `ArchiveService` covers the task and its direct subtasks only, which is enough for local tasks but not for a detached subtree deeper than one level.

**Tests**

- [ ] Detached task: `updateTask` succeeds; a later sync does not overwrite it.
- [ ] Reattach overwrites the local title with Linear's and keeps the linked note.
- [ ] Reattach of a deleted issue throws and leaves the task detached.
- [ ] Detaching a parent detaches all descendants.
- [ ] Reattach of a task with a local subtask throws and changes nothing.
- [ ] Archiving a detached three-level subtree archives every level; restoring brings every level back.

**Done when** a task can leave and rejoin sync without losing links.

## Milestone 4: Runtime

Sync runs by itself while a workspace is open. Everything the later IPC layer will call is a plain method or event on a core service.

### 13. SyncScheduler and workspace wiring

- [ ] Create `core/sync/scheduler.ts`. Constructor takes the engine, `IntegrationService`, and a clock or timer interface so tests can use fake timers.
- [ ] `start()`: run every enabled source once, then arm a 5-minute interval for incremental runs and a 30-minute interval for reconcile.
- [ ] `trigger(reason, sourceId?)` with reasons `focus`, `resume`, `manual`, `connected`. Focus and resume are ignored when the last run finished under 60 seconds ago. Manual always runs and includes reconcile.
- [ ] One run per source at a time. A trigger during a run sets a single "run again" flag.
- [ ] Backoff: skip interval ticks while `consecutiveFailures` implies a wait, doubling from 1 minute to a 30-minute cap. A manual trigger ignores backoff.
- [ ] Honour a provider-supplied retry delay after a rate-limited response.
- [ ] `stop()`: clear timers, abort in-flight runs, and resolve only when they have settled.
- [ ] Subscribe to `IntegrationService` change events: a newly enabled source triggers an initial sync; a disabled one is aborted.
- [ ] In `core/workspace/workspace.ts`: construct `SyncWriter`, `SyncEngine` and `SyncScheduler`; expose `workspace.sync`; turn on `journal_mode = WAL`.
- [ ] Make `Workspace.close()` async and await `scheduler.stop()` before closing SQLite. Update `WorkspaceService.open`, `delete` and any switch path to await it.
- [ ] Check that the native backup in `Workspace.open` still behaves with WAL on.

**Tests** (Vitest fake timers)

- [ ] Start runs each enabled source once; disabled sources never run.
- [ ] Interval fires at 5 minutes; reconcile at 30.
- [ ] Two focus triggers within 60 seconds cause one run.
- [ ] A trigger during a run causes exactly one follow-up run.
- [ ] Backoff grows after failures and resets after a manual sync.
- [ ] `stop()` during a run leaves no timers and no writes after it resolves.
- [ ] Closing a workspace mid-sync does not throw "database is closed".

**Done when** an open workspace stays current with Linear with no manual call.

### 14. Main-process wiring

The Electron-side pieces core needs in order to run inside the app. No IPC channels are added here; the separate IPC work will sit on top of the service surface listed at the end.

- [ ] In `src/main`, implement the real `SecretCipher` over Electron's async `safeStorage` API: `isAsyncEncryptionAvailable`, `encryptStringAsync` and `decryptStringAsync`.
- [ ] Pass `SecretCipher`, Electron's `net.fetch` and `shell.openExternal` into `DevBrain`, which threads them to `WorkspaceService` and `Workspace`. Use `net.fetch` rather than Node's global `fetch`: it goes through Chromium's network stack, so it honours the system proxy (including PAC files) and the OS certificate store, which Node's `fetch` does not. It can only be called after the app's `ready` event. `FetchFn` in `providers/provider.ts` is typed so either fits.
- [ ] Call `scheduler.trigger('focus')` on `BrowserWindow` focus and `scheduler.trigger('resume')` on `powerMonitor` resume, for the current workspace.
- [ ] Make sure switching or closing a workspace awaits the old scheduler's `stop()` before the next workspace starts.
- [ ] Keep engine progress and service changes as typed in-process events (`sync.onProgress`, `integrations.onChange`). The IPC layer will forward them later; nothing in core knows about the renderer.
- [ ] Give every core error a stable `code` property (`external_read_only`, `integration_auth`, `rate_limited`, `provider_unavailable`, `not_found`), so the IPC layer can serialise errors without parsing messages.
- [ ] Keep the types the renderer will eventually need (`Integration`, `ExternalSource`, `ExternalRef`, enums) free of main-only imports, so they can move to `src/common` unchanged.
- [ ] Remove the leftover `src/main/graphql/` directory if nothing else uses it.

**Service surface the IPC work will build on.** These are the only entry points; each takes plain arguments and returns plain data.

| Service                                 | Methods                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspace.integrations`                | `list`, `connectWithApiKey`, `connectWithOAuth`, `reconnect`, `setEnabled`, `setSourceEnabled`, `listCalendars`, `setCalendars`, `previewDisconnect`, `disconnect`, `detachTask`, `reattachTask`, `onChange` |
| `workspace.sync`                        | `syncNow(sourceId?)`, `getStatus()`, `onProgress`                                                                                                                                                            |
| `workspace.tasks`, `projects`, `events` | Existing methods; reads now include `external`, mutations may throw `ExternalReadOnlyError`                                                                                                                  |

**Tests**

- [ ] The `safeStorage` cipher round-trips a string and reports availability (run under Electron, or skip in plain Vitest).
- [ ] Each core error exposes its `code`.
- [ ] An integration test at the `DevBrain` level: open a workspace with fakes, connect, sync, close, with no Electron import in core.

**Done when** the running app, with `DEV_LINEAR_API_KEY` connected through the seed script, keeps the dev workspace in sync and logs each run, with no renderer involvement.

### 15. Disable, disconnect and re-authentication

- [ ] Disable: already flips flags in feature 7. Confirm the scheduler aborts a running sync and that mirrored rows stay untouched.
- [ ] Add `IntegrationService.previewDisconnect(id)`: counts of items that would be removed and items that would be kept as local copies. The dialog needs it.
- [ ] Implement `disconnect(id, { keepLocalCopies })`. Stop the scheduler for its sources first.
- [ ] With `keepLocalCopies: false`: delete synced tasks, projects and events that have no local links, no task note and, for projects, no local tasks. Detach the rest. Remove deleted rows from the search index.
- [ ] With `keepLocalCopies: true`: set every link to `detached`.
- [ ] Then revoke credentials at the provider where an endpoint exists (best effort, short timeout), delete the integration row, and let the cascade remove sources and null `sourceId` on surviving links.
- [ ] Reconnect matching: on a later connect of the same account, re-point links whose `provider` and `externalId` match and whose `sourceId` is null, instead of inserting duplicates.
- [ ] Re-authentication: `reconnect(id, newCredentials)` validates through `getAccount`, rejects a different `accountId`, saves credentials, sets status `connected`, keeps sources and cursors, and triggers a sync.
- [ ] In `WorkspaceService.delete`, revoke each integration's credentials (best effort) before removing the directory.

**Tests**

- [ ] Disconnect and remove: unlinked tasks are gone; a task with a note is detached and editable.
- [ ] Disconnect and keep: every task remains, all detached, badge data intact.
- [ ] A mirrored project holding a local task survives as a local project.
- [ ] Reconnect after "keep": the next sync reattaches by `externalId`; no duplicates.
- [ ] `reconnect` with a different account is rejected and changes nothing.
- [ ] Revocation failure does not block the disconnect.

**Done when** every row of the managing-integrations table in the design has a passing test.

## Milestone 5: OAuth and Google Calendar

Feature 16 builds a provider-agnostic OAuth module, then Google Calendar as its first consumer. Linear stays on API keys for now; its OAuth app is deferred and is listed last as configuration-only work.

Start Google's OAuth consent-screen setup and verification as soon as milestone 1 begins. It is the only item with an external lead time.

### 16a. OAuth with PKCE over loopback

The rule for this module: `core/integrations/oauth/` contains the whole flow and no provider names. A provider adds OAuth by declaring an `OAuthConfig` object and nothing else.

```ts
interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  clientId: string;
  clientSecret?: string; // only where the provider requires one
  scopes: string[];
  scopeSeparator?: ' ' | ','; // default ' '
  redirect: {
    ports: number[] | 'any'; // fixed list, or any free port
    path: string; // '/callback'
  };
  extraAuthorizeParams?: Record<string, string>; // e.g. access_type=offline
  clientAuth?: 'body' | 'basic'; // how client credentials reach the token endpoint
  parseTokens?: (json: unknown) => OAuthTokens; // default reads the standard fields
}

interface OAuthClient {
  authorize(config: OAuthConfig, opts: { signal: AbortSignal }): Promise<OAuthTokens>;
  refresh(config: OAuthConfig, refreshToken: string): Promise<OAuthTokens>;
  revoke(config: OAuthConfig, tokens: OAuthTokens): Promise<void>;
}
```

- [ ] Create `oauth/types.ts` with `OAuthConfig`, `OAuthTokens` (`accessToken`, `refreshToken?`, `expiresAt?`, `scopes`) and `OAuthClient`.
- [ ] Create `oauth/pkce.ts`: random `code_verifier`, S256 `code_challenge`, random `state`, using `node:crypto`.
- [ ] Create `oauth/loopback.ts`: an HTTP listener bound to `127.0.0.1`. It takes `redirect.ports` and `redirect.path`, tries each fixed port in turn or asks the OS for a free one, and returns the exact redirect URI it bound.
- [ ] The listener accepts one request to the configured path, checks `state`, answers with a small static "you can close this tab" page, and closes. Anything else gets a 404.
- [ ] Time out after 5 minutes. Support cancellation through an `AbortSignal`, so a caller can cancel a connect in progress. The later IPC channel for it is `integrations:cancelConnect`.
- [ ] Create `oauth/client.ts` implementing `OAuthClient`. `authorize` builds the URL from config only, opens it through the injected `openExternal`, awaits the callback, and exchanges the code and verifier.
- [ ] Handle the config variations generically: scope separator, extra authorize parameters, client secret present or absent, client credentials in the body or in a Basic header.
- [ ] Default `parseTokens` reads `access_token`, `refresh_token`, `expires_in` and `scope`. A provider overrides it only if its response is non-standard.
- [ ] `refresh` keeps the old refresh token when the response omits a new one, and maps `invalid_grant` to `IntegrationAuthError`.
- [ ] `revoke` is a no-op when `revokeUrl` is absent.
- [ ] Add `oauth?: OAuthConfig` to the `Provider` interface. `authMethods` includes `oauth` exactly when it is set.
- [ ] Add `IntegrationService.connectWithOAuth(providerId, { signal })`: look up the provider's config, call `OAuthClient.authorize`, call `getAccount`, then store exactly as the API key path does. No provider-specific branch.
- [ ] Wire `CredentialStore.getAuth` to `OAuthClient.refresh` through the provider's config, so refresh is generic too.
- [ ] Wire disconnect to `OAuthClient.revoke`.
- [ ] Allow only one connect flow at a time per workspace.
- [ ] Read client ids and secrets from environment at build time, keyed by provider; add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.template`.
- [ ] Write `tests/integrations/oauth/contract.ts`: a reusable suite, `describeOAuthProvider(config)`, that runs the full flow against a fake authorization server. Every provider with an `OAuthConfig` calls it.

**Tests**

- [ ] PKCE: the challenge is the base64url SHA-256 of the verifier.
- [ ] Loopback with a real listener on a test port: happy path; wrong `state` rejected; timeout; abort; second request ignored; first fixed port busy falls through to the next.
- [ ] Client with a fake authorization server: the exchange sends the verifier and the exact redirect URI that was bound.
- [ ] Two fake providers with opposite configs pass the contract suite with no change under `oauth/`: one with any port, a client secret in the body and extra authorize parameters; one with fixed ports, no secret and comma-separated scopes.
- [ ] Refresh: an expiring token is refreshed once under two concurrent callers; a response without a new refresh token keeps the old one.
- [ ] Refresh failure moves the integration to `needs_reauth`.
- [ ] A grep-style test or lint rule: no file under `oauth/` imports from `providers/`.

**Done when** a real Google account completes the flow in the system browser and the integration row is stored.

### 16b. Google Calendar events

- [ ] Verify against Google's documentation: whether the first `events.list` call may use a lower time bound and still return a sync token; the narrowest read-only scopes; the 410 behaviour.
- [ ] Create `providers/google-calendar/client.ts`: `getAccount`, `listCalendars`, `listEvents(calendarId, { syncToken | timeMin, pageToken })`.
- [ ] Record fixtures: timed event, all-day event, recurring master, cancelled instance, modified instance, declined event, event with a Meet link, cancelled event.
- [ ] Write `mapper.ts`: `toExternalEvent` per the field mapping in the design. Convert description HTML to Markdown with a small, well-known library, and strip anything it cannot convert.
- [ ] Add the `EventSource` side of the provider contract: `pull(auth, cursor, config)` iterating the selected calendars, with one sync token per calendar in the cursor.
- [ ] On 410 for a calendar, clear only that calendar's token and restart it from the time bound.
- [ ] Add `SyncWriter.applyEventPage(sourceId, { events, cancelledIds })`.
- [ ] Recurrence: store a master with its rule lines joined by newlines. For a cancelled instance, append an `EXDATE` to the master. For a modified instance, insert its own row, append an `EXDATE` for the original start, and record the master's external id in metadata.
- [ ] Handle an exception arriving before its master in the feed: park it and apply once the master exists.
- [ ] Keep the series time zone in link metadata.
- [ ] Removal: delete the row when nothing links to it; otherwise keep it and set the link to `removed`.
- [ ] Index events for search on insert and change; remove on delete.
- [ ] Calendar selection: `IntegrationService.listCalendars(sourceId)` and `setCalendars(sourceId, ids)`. Preselect the primary calendar on connect. Adding a calendar syncs only that calendar; removing one deletes its events under the same removal rule.
- [ ] Teach the engine to run an events source: same loop, `applyEventPage` instead of `applyTaskPage`. Events have no reconcile pass.
- [ ] Add the `sources:listCalendars` and `sources:setCalendars` channels later, with the IPC work. Core only exposes the two service methods.

**Tests**

- [ ] Mapper: each fixture maps to the expected row, including `allDay` and `meetingUrl`.
- [ ] Initial sync stores a sync token; the next run sends only the token.
- [ ] 410 triggers a full resync of one calendar with no duplicate rows and linked notes intact.
- [ ] Cancelled instance adds an `EXDATE`; modified instance creates a second row and an `EXDATE`.
- [ ] A cancelled event with a linked note is hidden from `listEventsInRange` but still resolvable by id.
- [ ] Deselecting a calendar removes its unlinked events only.
- [ ] `updateEvent` on a synced event throws.

**Done when** a real calendar mirrors correctly, including one weekly series with a moved and a cancelled occurrence.

### 16c. Linear OAuth (deferred)

Not part of the current build. Linear connects with an API key until this is picked up. Because 16a is provider-agnostic, what remains is registration and configuration, not flow code.

- [ ] Register the Linear OAuth application with fixed loopback redirect URIs.
- [ ] Add an `OAuthConfig` to the Linear provider: URLs, the `read` scope, the fixed ports. No changes under `oauth/`.
- [ ] Make the Linear client build its auth header from either credential type.
- [ ] Call `describeOAuthProvider(linear.oauth)` in the Linear tests.
- [ ] Add an upgrade path: `reconnect` on an API key integration with OAuth credentials for the same account switches `authType` and keeps all data.

**Tests**

- [ ] Connect through OAuth with a fake token endpoint; sync runs with a bearer header.
- [ ] Upgrading from API key to OAuth keeps the integration id, sources, cursors and links.

**Done when** Linear connects without the user ever seeing an API key.

## Deferred: UI

### UI requirements, for later

Not part of this build. Kept as a record of what the integration feature will need from each view once the IPC layer and the views exist.

**Integrations settings page**

- [ ] A page listing each available provider with its state: not connected, connected (account label), paused, needs reconnect.
- [ ] Connect Linear: an API key field with a link to where Linear issues keys, inline validation errors, and a note that the key path is temporary. Once 16c lands, an OAuth button becomes the default.
- [ ] Connect Google Calendar: a button that starts the OAuth flow, a "waiting for browser" state and a cancel action.
- [ ] Per source: an enable switch, last synced time, and the last error if any.
- [ ] Google: a calendar checklist backed by `sources:listCalendars` and `sources:setCalendars`.
- [ ] Disconnect dialog: show the counts from `previewDisconnect` and the two choices, remove or keep as local copies.
- [ ] Reconnect action when the status is `needs_reauth`.
- [ ] A first-connect notice that mirrored data is stored locally in the workspace folder.

**Tasks and projects**

- [ ] Provider icon and issue key on external rows in every list, board and group view.
- [ ] Show Linear's own status and priority labels beside the mapped ones.
- [ ] Origin filter: all, local, external.
- [ ] Task detail for a synced task: provider-owned fields rendered read-only, an "Open in Linear" action, the description rendered as Markdown through the existing sanitising path.
- [ ] Keep link actions enabled on synced tasks: attach a note, link an event, favourite.
- [ ] Detach action with a short explanation; reattach action with an overwrite confirmation.
- [ ] "Detached from ENG-123" badge on detached tasks, and "Detached from Linear" on detached projects.
- [ ] Parent hint on a top-level sub-issue whose parent is not mirrored.
- [ ] Cancelled status in status pickers, filters, board columns and grouping, for local and external tasks.
- [ ] Undated tasks: a "No due date" group or sort position, and no date formatting crash.
- [ ] Project view: mark local tasks inside a mirrored project as local; allow creating one there.
- [ ] Handle `external_read_only` errors from IPC with a toast that offers detach.

**Calendar**

- [ ] Render synced events with their calendar colour and a provider marker.
- [ ] Dim declined events.
- [ ] Event detail: read-only fields, "Open in Google Calendar", join link from `meetingUrl`, and the note-linking action.
- [ ] A linked note whose event was cancelled shows "event cancelled".

**Sync status**

- [ ] A small global indicator: idle with last synced time, syncing, error, needs reconnect.
- [ ] Initial sync progress from `sync:progress`, such as "Syncing Linear, 150 issues so far".
- [ ] "Sync now" action.
- [ ] On `sync:progress`, refetch only the queries for the entity types listed in `changed`.
- [ ] "Paused" hint on badges when a source or integration is disabled.

**Tests**

- [ ] Component tests for the read-only task detail: edit controls disabled, link actions enabled.
- [ ] Component test for the disconnect dialog showing both counts.
- [ ] One manual end-to-end pass per release against a real Linear workspace and Google account: connect, initial sync, edit remotely, focus the app, detach, reattach, disable, disconnect.

**Done when** a new user can connect both providers, see their issues and meetings beside local items, and never needs the dev console.

## Suggested first week

Features 1, 2 and 3 in that order. Feature 1 is the only one that can break existing behaviour, so it should merge alone with the full suite green before anything is built on top of it.
