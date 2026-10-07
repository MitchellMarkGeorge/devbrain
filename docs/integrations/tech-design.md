# DevBrain v1 Integrations & Sync — Tech Design

Oct 2, 2026 · @Mitchell Mark-George

## Summary

v1 mirrors Linear issues and Google Calendar events into the open workspace's SQLite database, one way and read-only. Local tasks, projects and events keep working exactly as they do today.

The design rests on six decisions:

1. **Mirror, don't proxy.** External items are stored as ordinary rows in `tasks`, `projects` and `events`, so lists, linking and search work unchanged.
2. **One side table carries external identity.** A new `external_links` table maps a local row to its remote item. A row is external if it has a link in the `synced` state.
3. **Integration and external source are separate records.** An integration is a connected account. An external source is a role (tasks, events, version control) that an integration is switched on for.
4. **Everything lives in the workspace database.** Each workspace already has its own `db.sqlite`, so per-workspace scoping needs no extra mechanism.
5. **Credentials are encrypted with Electron `safeStorage`** and never leave the main process. Linear ships with API keys; its OAuth app is deferred. Google Calendar ships with OAuth with PKCE from day one.
6. **Sync is cursor-based polling** every 5 minutes, on window focus, on workspace open and on demand. No webhooks, because the app has no server.

The largest required change to existing code is making `tasks.dueDate` and `projects.dueDate` nullable. Linear issues and projects often have no due date.

**Scope of the current build.** Core only: the data model, integrations, credentials, providers and sync, in `src/main/core`, plus the main-process wiring core needs to run. IPC is being built separately with a dedicated typed solution, and the UI comes later. The IPC contract and UI notes further down are kept as requirements for that later work, not as part of this build.

## Goals and non-goals

**Goals**

- Connect a Linear account and a Google account to a workspace, and manage each connection (enable, disable, disconnect).
- Mirror Linear issues assigned to the user, with their projects and sub-issues, into the task and project lists.
- Mirror Google Calendar events from chosen calendars into the calendar.
- Show external and local items in the same views, with the source always visible.
- Keep mirrored items linkable to notes, events and tasks.
- Let the user detach an external task into a local copy, and reattach it later.
- Sync in the background without blocking the UI.

**Non-goals for v1**

- Writing back to Linear or Google (status changes, comments, new issues, RSVP).
- GitHub or any version control source. The `version_control` source type is reserved in the schema only.
- Webhooks or any hosted backend.
- Syncing workspaces that are not open.
- Mirroring Linear comments, attachments, cycles, labels or team-wide issues.
- Moving external tasks into local projects, or hiding a synced task without detaching it.
- Multiple accounts of the same provider in one workspace. The schema allows it; the UI does not.

## Current state

The core services are built and tested; the API layer and UI are not. These facts from the codebase shape the design.

| Area              | Today                                                                                                                                    | Consequence for integrations                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Workspace storage | Each workspace owns a `db.sqlite` under `workspaces/<id>/`, opened by `Workspace.open`                                                   | Integration tables go in the workspace database. Scoping is free.                                       |
| Open workspaces   | `WorkspaceService` holds one `currentWorkspace`                                                                                          | Sync runs only for the open workspace.                                                                  |
| Tasks             | `dueDate` is `NOT NULL`; statuses are NOT_STARTED, IN_PROGRESS, COMPLETED; priorities are LOW, MEDIUM, HIGH                              | Due date must become nullable. Linear's richer states and priorities need a mapping plus the raw label. |
| Subtasks          | `createSubtask` and `demoteTask` allow one level only                                                                                    | Depth guards must apply to local tasks only.                                                            |
| Task links        | One of `linkedEventId` or `linkedNoteId`; subtasks inherit the parent's project and links                                                | Links are local-owned fields that sync must never overwrite.                                            |
| Projects          | `dueDate` is `NOT NULL`; four statuses                                                                                                   | Same nullability change. Linear project states map onto the four.                                       |
| Events            | `reccurrenceRule` stores RFC 5545 lines, chosen to match Google Calendar; no `archivedAt`, deletes are hard                              | Recurring masters map directly. Removal needs a soft state on the link row.                             |
| Search            | FTS5 `search_index`; services call `indexTask`, `indexEvents` and friends explicitly                                                     | The sync writer must index what it upserts and remove what it deletes.                                  |
| Timestamps        | `updatedAt` uses `$onUpdate(() => new Date())`                                                                                           | Sync must skip unchanged rows, or every poll rewrites `updatedAt`.                                      |
| Database open     | Native backup to `db.sqlite.backup` on every open; WAL is off                                                                            | Encrypted credentials are copied into the backup. WAL should be on before background writes start.      |
| Core dependencies | `src/main/core` does not import Electron; tests mock `electron-store`                                                                    | Secret storage and HTTP must be injected interfaces.                                                    |
| API and UI        | `schema.graphql` exists but GraphQL has been dropped for a custom typed IPC layer; `graphql/schema.ts` is empty; IPC exposes `ping` only | Integration channels and sync events are added to the custom typed IPC contract. GraphQL is not used.   |
| IDs               | Prefixed UUIDv7 (`tsk_`, `prj_`, `evt_`) via `generateId`                                                                                | Add `int_`, `src_` and `xln_` prefixes.                                                                 |

**Changed in `main` since 2 October.** Keyset pagination was added in `core/shared/pagination.ts`, and every list method now returns a `Page`. Its `keyset` helper assumes non-null sort values, which matters for nullable due dates. Migrations now run to `0015`. `tests/db/pagination-indexes.test.ts` asserts the index each list query uses. The GraphQL schema file was removed.

## Concepts

Four terms carry the model.

- **Integration**: an authenticated connection between one workspace and one account on a provider. It holds credentials and account identity. It syncs nothing by itself.
- **External source**: a role an integration plays in the workspace. Types are `tasks`, `events` and `version_control`. A source can be enabled or disabled without touching the connection.
- **External item**: a task, project or event mirrored from a source. The provider owns it. DevBrain holds a read-only copy.
- **Detached item**: a former external item the user has taken ownership of. It is a local item that remembers where it came from.

The split between integration and source is what lets one GitHub connection later serve as version control but not as a task source.

| Provider        | Can serve as           | v1     |
| --------------- | ---------------------- | ------ |
| Linear          | tasks                  | tasks  |
| Google Calendar | events                 | events |
| GitHub (later)  | tasks, version_control | none   |

**Ownership rule.** Each field on a mirrored row has one owner. The provider owns content fields. DevBrain owns relationship fields. Sync overwrites the first group and never touches the second.

| Owner    | Fields                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Provider | title, description, status, priority, start and due dates, parent, project, completed time, created time |
| DevBrain | `linkedNoteId`, `linkedEventId`, the task note, `favoritedAt`                                            |

**Scoping.** Integrations, sources, links and credentials all live in the workspace database. Connecting Linear in workspace A creates nothing in workspace B. The same Linear account can be connected in both; each keeps its own tokens and cursors.

## Architecture

All integration code runs in the main process, inside `src/main/core`, as two new modules beside the existing services: `integrations` and `sync`.

&#91;embedded content: integration and sync components in the main process\]

Only the provider adapters talk to the network, and only `SyncWriter` writes external rows. The existing entity services keep writing local rows and reject edits to synced ones.

| Component            | Location                                                    | Responsibility                                                                                  |
| -------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `IntegrationService` | `core/integrations/service.ts`                              | Connect, disconnect, enable and disable. Owns the `integrations` and `external_sources` tables. |
| `CredentialStore`    | `core/integrations/credentials.ts`                          | Encrypts and decrypts tokens through an injected `SecretCipher`. Refreshes OAuth tokens.        |
| OAuth loopback       | `core/integrations/oauth/`                                  | PKCE pair, state, temporary `127.0.0.1` listener, code exchange.                                |
| Provider adapters    | `core/integrations/providers/linear`, `.../google-calendar` | API client and mapper per provider. The only code that knows a provider's shapes.               |
| `SyncEngine`         | `core/sync/engine.ts`                                       | Runs one sync for one source: pull pages, hand them to the writer, advance the cursor.          |
| `SyncWriter`         | `core/sync/writer.ts`                                       | The only code allowed to write external rows. Upserts, removes, indexes for search.             |
| `SyncScheduler`      | `core/sync/scheduler.ts`                                    | Decides when to sync: interval, focus, open, manual. One run per source at a time.              |

`Workspace` constructs `IntegrationService` and `SyncScheduler` next to `TaskService` and the rest. `Workspace.close()` stops the scheduler before closing SQLite.

**Provider contract.** Adapters are pure with respect to the database. They return normalised items; the engine decides what to write.

```ts
interface Provider {
  id: 'linear' | 'google_calendar';
  supports: SourceType[]; // ['tasks'] or ['events']
  authMethods: ('oauth' | 'api_key')[];
  oauth?: OAuthConfig; // endpoints, scopes, redirect ports
  getAccount(auth: Auth): Promise<ExternalAccount>;
  tasks?: TaskSource;
  events?: EventSource;
}

interface TaskSource {
  // one page per call; cursor is opaque to the engine
  pull(
    auth: Auth,
    cursor: SyncCursor | null,
    config: SourceConfig,
  ): Promise<{
    tasks: ExternalTask[];
    projects: ExternalProject[];
    removedIds: string[];
    nextCursor: SyncCursor;
    done: boolean;
  }>;
  // ids of open items currently assigned to the user (id field only)
  listAssignedIds(auth: Auth): Promise<string[]>;
  // current state of specific items; ids that no longer resolve are gone
  lookup(auth: Auth, externalIds: string[]): Promise<{ tasks: ExternalTask[]; gone: string[] }>;
}
```

`ExternalTask` already carries DevBrain's `TaskStatus` and `TaskPriority` plus the provider's raw labels. Mapping lives in each adapter's `mapper.ts`, which keeps it unit-testable against fixture payloads.

**Why core stays free of Electron.** `SecretCipher`, `fetch` and `openExternal` are constructor arguments. The main process passes `safeStorage`, global `fetch` and `shell.openExternal`. Tests pass fakes, matching how `electron-store` is mocked today.

## Authentication

Google Calendar connects through OAuth 2.0 authorization code with PKCE over a loopback redirect. Linear connects with a personal API key; its OAuth app is deferred.

**Provider-agnostic OAuth.** The whole flow lives in `core/integrations/oauth/` and names no provider. A provider opts in by declaring an `OAuthConfig`: authorize, token and revoke URLs, client id and optional secret, scopes, redirect ports and path, and any extra authorize parameters. Authorize, refresh and revoke are generic functions over that config. Adding OAuth to Linear, GitHub or any later integration is then configuration plus a shared contract test, with no new flow code.

**OAuth flow**

1. The renderer asks to connect a provider. The main process creates a `code_verifier`, its S256 `code_challenge` and a random `state`.
2. The main process starts an HTTP listener bound to `127.0.0.1` only.
3. `shell.openExternal` opens the provider's authorize URL in the system browser. No embedded webview, so the user's existing session and password manager work.
4. The provider redirects to `http://127.0.0.1:<port>/callback?code=...&state=...`. The listener checks `state`, serves a "you can close this tab" page and shuts down.
5. The main process exchanges the code and verifier for tokens, calls `getAccount`, and stores the integration.
6. The listener times out after 5 minutes if no callback arrives.

|                | Linear                                               | Google Calendar                                                                  |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| v1 method      | API key; OAuth deferred                              | OAuth                                                                            |
| Auth header    | `Authorization: <API_KEY>`, no `Bearer`              | `Authorization: Bearer <token>`                                                  |
| Scopes         | `read` (when OAuth is added), comma-separated        | `calendar.calendarlist.readonly` and `calendar.events.readonly`, space-separated |
| Redirect port  | Fixed, from a short pre-registered list (to confirm) | Any free port on `127.0.0.1`                                                     |
| Client secret  | Optional with PKCE                                   | Optional for desktop clients; sent if the console issues one                     |
| Token lifetime | Access tokens last 24 hours; refresh tokens issued   | Refresh tokens always returned for installed apps                                |

Endpoints, limits and sources for each row are in the provider reference section. The few details not yet confirmed are listed under open questions.

**API key path (Linear).** The user pastes a personal API key in settings. DevBrain validates it with a `viewer` query, then stores it like any other credential. The integration records `authType = 'api_key'` so the UI can offer "upgrade to OAuth" later without reconnecting data.

**Storage.** Credentials are serialised to JSON, encrypted with `safeStorage.encryptStringAsync`, and stored as a blob in `integrations.credentials`. The key lives in the OS keychain, so a copied `db.sqlite` or `db.sqlite.backup` is useless on another machine. If `safeStorage.isAsyncEncryptionAvailable()` resolves false, connecting is refused with a clear error. When `decryptStringAsync` reports `shouldReEncrypt` (the key was rotated), the credentials are re-encrypted and stored again.

**Refresh.** `CredentialStore.getAuth()` refreshes when the access token is within 60 seconds of expiry, under a per-integration mutex so two sync runs cannot both refresh. A failed refresh or a 401 sets the integration to `needs_reauth` and pauses its sources. Mirrored data stays visible.

**Boundary.** Tokens never cross IPC. The renderer sees provider, account label, status and timestamps only.

## Data model changes

Three new tables and two nullability changes. No new columns on `tasks`, `projects` or `events`.

**New table: `integrations`**

| Column                   | Type      | Notes                                    |
| ------------------------ | --------- | ---------------------------------------- |
| `id`                     | text PK   | `int_` prefix                            |
| `provider`               | text      | `linear`, `google_calendar`              |
| `authType`               | text      | `oauth`, `api_key`                       |
| `accountId`              | text      | Provider's user id                       |
| `accountLabel`           | text      | Email or display name, shown in settings |
| `status`                 | text      | `connected`, `disabled`, `needs_reauth`  |
| `credentials`            | blob      | `safeStorage` ciphertext                 |
| `scopes`                 | text      | Granted scopes                           |
| `createdAt`, `updatedAt` | timestamp |                                          |

Unique on (`provider`, `accountId`).

**New table: `external_sources`**

| Column                             | Type      | Notes                                                          |
| ---------------------------------- | --------- | -------------------------------------------------------------- |
| `id`                               | text PK   | `src_` prefix                                                  |
| `integrationId`                    | text FK   | Cascade on delete                                              |
| `sourceType`                       | text      | `tasks`, `events`, `version_control`                           |
| `enabled`                          | boolean   |                                                                |
| `config`                           | json text | Linear: none in v1. Google: selected calendar ids              |
| `cursor`                           | json text | Opaque to the engine. Google keeps one sync token per calendar |
| `initialSyncCompletedAt`           | timestamp | Null until the first full pass finishes                        |
| `lastSyncedAt`, `lastReconciledAt` | timestamp |                                                                |
| `lastError`                        | text      | Null when the last run succeeded                               |
| `consecutiveFailures`              | integer   | Drives backoff                                                 |

Unique on (`integrationId`, `sourceType`).

**New table: `external_links`**

| Column                                 | Type      | Notes                                                                              |
| -------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `id`                                   | text PK   | `xln_` prefix                                                                      |
| `sourceId`                             | text FK   | Set null on delete, so detached copies survive a disconnect                        |
| `provider`                             | text      | Kept on the row so the badge survives a disconnect                                 |
| `taskId`, `projectId`, `eventId`       | text FK   | Exactly one is set. Cascade on delete. Unique each                                 |
| `externalId`                           | text      | Provider's stable id                                                               |
| `externalKey`                          | text      | Human identifier, such as `ENG-123`                                                |
| `externalUrl`                          | text      | Opens the item in the provider                                                     |
| `externalUpdatedAt`                    | timestamp | Used to skip unchanged items                                                       |
| `state`                                | text      | `synced`, `detached`, `removed`                                                    |
| `metadata`                             | json text | Raw status and priority labels, team, parent title, calendar id, attendee response |
| `lastSyncedAt`, `removedAt`, settledAt | timestamp |                                                                                    |

Unique on (`sourceId`, `externalId`). A `CHECK` enforces exactly one entity column, following the existing `one_link` pattern.

**Changes to existing tables**

| Table      | Change                                  | Why                                                                                                      |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `tasks`    | `dueDate` becomes nullable              | Linear issues often have none. `TaskService.createTask` still requires it for local tasks.               |
| `projects` | `dueDate` becomes nullable              | Linear's target date is optional. `ProjectService.createProject` still requires it for local projects.   |
| `tasks`    | `status` accepts a new value, CANCELLED | Enum change only; the column and its check constraint are unchanged.                                     |
| `tasks`    | `pullRequestUrl` is kept                | Local tasks need a URL with no integration connected. A rename to a generic `url` can follow separately. |

Required due dates for local items are enforced in the services, not the schema, because integration data can lack them.

SQLite cannot drop `NOT NULL` in place, so drizzle-kit generates a table rebuild for each. The FTS table is separate and unaffected. `idx_tasks_status_due_date` is recreated by the rebuild.

**Read shape.** `Task`, `Project` and `Event` gain an optional `external` field, filled by a shared lookup run after each query so the keyset queries and their indexes stay untouched:

```ts
interface ExternalRef {
  provider: 'linear' | 'google_calendar';
  state: 'synced' | 'detached' | 'removed';
  key: string | null; // ENG-123
  url: string;
  statusLabel: string | null; // "In Review"
  priorityLabel: string | null; // "Urgent"
  lastSyncedAt: Date;
}
```

`TaskFilterOptions` gains `origin?: 'local' | 'external'` so views can filter either way.

## External tasks and projects

A Linear issue becomes a `tasks` row plus an `external_links` row; its project becomes a `projects` row plus a link. Lists show both kinds together, with a provider badge and the issue key on external ones.

**What gets mirrored**

- Issues assigned to the connected user that are still open, at any age.
- Issues assigned to the user that were completed or cancelled in the last 30 days.
- The Linear project of any mirrored issue. No other projects.

Open issues are included regardless of age because a 60-day-old open issue is still the user's work. The 30-day window from the brief applies to closed history.

**Status mapping (Linear workflow state type)**

| Linear type                | DevBrain status | Notes                           |
| -------------------------- | --------------- | ------------------------------- |
| triage, backlog, unstarted | NOT_STARTED     |                                 |
| started                    | IN_PROGRESS     |                                 |
| completed                  | COMPLETED       | `completedAt` taken from Linear |
| canceled                   | CANCELLED (new) | `completedAt` stays null        |

`TaskStatus` gains `CANCELLED = 4`. The column is an integer, so no migration is needed, and the `completed_at_consistency` check still holds because a cancelled task has no `completedAt`. The value is part of the shared enum, so local tasks can be cancelled too. Cancelled tasks sort after completed ones, are hidden by the same `showCompletedTasks` setting, and are counted separately in project stats so they do not inflate progress.

The team's own state name ("In Review", "Blocked") is kept in `metadata.statusLabel` and shown on the task. The mapped value drives grouping, sorting and project stats. Mapping by state type means custom workflows need no per-team setup.

**Priority mapping**

| Linear           | DevBrain |
| ---------------- | -------- |
| Urgent, High     | HIGH     |
| Medium           | MEDIUM   |
| Low, No priority | LOW      |

The raw label is kept, so "Urgent" still displays as urgent.

**Project mapping.** Linear project states map as: backlog and planned to NOT_STARTED, started to ACTIVE, paused to ON_HOLD, completed and canceled to COMPLETED. Title, description, start date, target date and colour are mirrored.

**Project membership.** `tasks.projectId` on an external task always follows Linear. An orphan issue later added to a Linear project moves to the mirrored project on the next sync, creating it if needed. `updateProject` rejects external tasks.

**Local tasks in mirrored projects.** A local task can be created in, or moved into, a mirrored project. This covers work only the user is tracking alongside the team's issues. Such a task is local in every respect: editable, never sent to Linear, and untouched by sync. It counts in the project's stats and is marked as local in the project view.

**Project lifecycle.** A mirrored project leaves scope when it is deleted or removed in Linear, or when none of the user's mirrored issues belong to it any more. What happens next depends on whether it holds local or detached tasks.

- **It holds local or detached tasks: the project is detached.** Its link moves to `detached` and it becomes a normal local project: editable, no longer updated by sync, with a "Detached from Linear" badge. The user's own tasks keep their home.
- **It holds none: the project is archived.** Its link is marked `removed`. It is archived, not deleted, so notes filed under it keep their link.

**What happens to items in a detached project**

| Item in the project           | Result                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local tasks                   | Stay in the project, unchanged                                                                                                                                      |
| Detached tasks                | Stay in the project, unchanged                                                                                                                                      |
| Synced Linear issues          | Follow Linear. They move to the project Linear now reports, or become tasks with no project. They do not stay, because a synced task cannot live in a local project |
| Notes filed under the project | Stay                                                                                                                                                                |

If the same Linear project comes back into scope later, the detached project is reattached automatically instead of creating a duplicate. Provider-owned fields are refreshed and the local tasks stay in it. Automatic reattach is safe here because the detach was automatic too; projects have no manual detach in v1.

The reconcile pass checks mirrored project ids as well as issue ids, so a project deleted in Linear is noticed even if its issues were not otherwise touched.

**Subtasks.** Linear sub-issues map to `parentTaskId` at any depth. The one-level limit stays for local tasks only: `createSubtask` and `demoteTask` reject external parents and children outright. If the parent issue is not mirrored (assigned to someone else), the child appears as a top-level task and the parent's key and title are kept in metadata for display. Each page is applied parents first, then children.

**Read-only enforcement.** Enforced in the service layer, not only the UI.

| Operation on a `synced` task                                                                   | Result                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------- |
| `updateTask`, `updateStatus`, `updateProject`, `promoteSubtask`, `demoteTask`, `createSubtask` | Throws `ExternalReadOnlyError`    |
| `updateLinks` (note or event)                                                                  | Allowed. Links are DevBrain-owned |
| Attach a task note, favourite                                                                  | Allowed                           |
| `archiveTask`                                                                                  | Rejected. Detach first            |

Local subtasks inherit links from their parent. External subtasks do not; each carries its own links.

**Description.** Linear descriptions are Markdown and are stored as is. They render read-only. DevBrain-only syntax such as local links is never sent anywhere, which is one reason write-back is out of scope.

**Detach and reattach**

- **Detach** sets the link state to `detached`. The row becomes a normal local task: editable, archivable, skipped by sync. The badge changes to "Detached from ENG-123". Detaching a parent detaches its subtree.
- **Reattach** sets the state back to `synced` and forces a refresh of that one issue. Local edits to provider-owned fields are overwritten, after a confirmation. Links and the task note are kept.
- A detached task stays in its mirrored project and counts as a reason to keep that project.
- Reattach fails with a clear message if the issue no longer exists or the integration is gone.

## External events

Google Calendar events are mirrored as `events` rows for the calendars the user selects, from 30 days back with no forward limit.

**Why events differ from tasks.** Relevance is by time window and calendar, not by assignee. Google also provides a true incremental feed (sync tokens), so no `updatedAt` cursor or reconcile pass is needed.

**Calendar selection.** On connect, DevBrain lists the user's calendars and preselects the primary one. The selection is stored in `external_sources.config`. Adding a calendar triggers an initial sync for that calendar only. Removing one removes its mirrored events.

**Field mapping**

| Google                                  | DevBrain                     | Notes                                                                       |
| --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `summary`                               | `title`                      | "(No title)" when empty                                                     |
| `description`                           | `description`                | Google sends HTML; convert to Markdown on the way in                        |
| `start`, `end`                          | `startAt`, `endAt`, `allDay` | Date-only values set `allDay`                                               |
| `location`                              | `location`                   |                                                                             |
| `recurrence`                            | `reccurrenceRule`            | Lines joined with newlines. Same RFC 5545 format the column already expects |
| `hangoutLink` or conference entry point | `meetingUrl`                 |                                                                             |
| Calendar or event colour                | `color`                      |                                                                             |
| `htmlLink`                              | `external_links.externalUrl` |                                                                             |
| Own attendee response                   | `metadata.response`          | Declined events are mirrored and shown dimmed                               |

**Recurring events.** Sync requests series, not expanded instances. One row per series keeps storage small and matches `listEventsInRange`, which already returns recurring rows unexpanded.

- A series master is one row with its rule.
- A cancelled single occurrence adds an `EXDATE` line to the master's rule.
- A modified single occurrence becomes its own row, and the master gets an `EXDATE` for the original start. The link's metadata records the master's external id.

**Time zones.** Timed events are stored as instants, as today. All-day events are stored at local midnight with `allDay = true`. Recurring series also need the event's original time zone for correct expansion across daylight-saving changes; it is kept in link metadata until `events` gets a column for it.

**Read-only.** `updateEvent` and `deleteEvent` throw `ExternalReadOnlyError` for synced events. Linking a note or tasks to a synced event is allowed, which is the main use: meeting notes.

**Removal.** `events` has no `archivedAt` and deleting a row would null out a linked note's `linkedEventId`. So a cancelled or deleted Google event with local links is kept and its link is marked `removed`; the calendar hides it and the note shows "event cancelled". Without local links, the row is deleted.

**Detach** is not offered for events in v1. Copying an event locally is a simple "duplicate" action instead.

## Sync engine

Sync is a pull loop in the main process: fetch a page, apply it in one SQLite transaction, save the cursor in that same transaction, repeat. A crash at any point resumes from the last committed page.

**Triggers**

| Trigger                           | Behaviour                                              |
| --------------------------------- | ------------------------------------------------------ |
| Source enabled for the first time | Initial sync starts immediately                        |
| Workspace opened                  | Sync every enabled source                              |
| Interval                          | Every 5 minutes while the workspace is open            |
| Window focus                      | Sync if the last run finished more than 60 seconds ago |
| System resume or network back     | Same rule as focus                                     |
| "Sync now"                        | Always runs; also runs the reconcile pass              |

Recommendation on "3 or 5 minutes": use 5. The focus trigger covers the case that matters, which is returning to the app after changing something in Linear. A shorter interval mostly adds requests while nobody is looking. The interval is a constant per source type, so it is cheap to tune later.

**Scheduler rules**

- One run per source at a time. A trigger during a run is coalesced into at most one follow-up run.
- Sources sync independently; a Google failure does not delay Linear.
- Failures back off exponentially from 1 minute to 30 minutes. A manual sync resets the backoff.
- A 401 moves the integration to `needs_reauth` and stops scheduling it.
- A rate-limited response waits for the provider's stated retry time before the next attempt.
- Timers stop on `Workspace.close()`. An in-flight run is aborted through an `AbortSignal`; its uncommitted page is discarded.

**Initial sync (Linear)**

1. Query issues assigned to the viewer that are open, or closed within the last 30 days. Page size 50, ordered by `updatedAt`.
2. Each page carries the issue's project, parent id, state, priority and dates, so no follow-up request per issue is needed.
3. Apply each page: projects first, then issues in parent-before-child order.
4. After the last page, set `initialSyncCompletedAt` and store the highest `updatedAt` seen as the cursor.

The UI shows "Syncing Linear, 150 issues so far" during the first pass. Items appear page by page.

**Incremental sync (Linear)**

One query per run: issues assigned to the viewer with `updatedAt` greater than the cursor. It catches new assignments, edits and completions. The cursor is stored with a 60-second overlap; upserts are idempotent, so re-reading a few items is harmless.

This query cannot see an issue that was reassigned away, trashed or deleted, because such an issue no longer matches the assignee filter. Those are found by the reconcile pass below, not by querying mirrored ids on every run. An id list sent every 5 minutes would grow with the user's history.

**Watched set.** Only some links are checked for removal, which keeps the work tied to current workload:

- `detached` and `removed` links are never checked.
- A completed or cancelled issue older than 30 days is marked settled (`settledAt` on the link). It stays mirrored and is no longer checked.
- A settled issue that is reopened while still assigned to the user comes back through the incremental query, which clears `settledAt`.

The watched set is therefore open assigned issues plus issues closed in the last 30 days.

**Reconcile (Linear).** Removals are found by diffing against a snapshot of current assignments:

1. Page through the ids of open issues assigned to the viewer, requesting the `id` field only.
2. Compare with the watched links that are still open locally. A watched link missing from the snapshot is a candidate.
3. Fetch the candidates by id, in batches of 100, including archived issues.
4. Apply the result: completed or cancelled issues are updated, reassigned ones are removed, and ids that no longer resolve were deleted and are removed.
5. Archive mirrored projects that no longer have tasks, and mark newly aged-out closed issues as settled.

Cost scales with the number of open assigned issues, not with everything ever mirrored. Most passes find no candidates and make no second request.

| Linear run  | When                                               | Catches                                           |
| ----------- | -------------------------------------------------- | ------------------------------------------------- |
| Incremental | Every 5 minutes, on focus                          | New assignments, edits, completions               |
| Reconcile   | Every 30 minutes, on workspace open, on "Sync now" | Reassigned away, trashed, deleted, empty projects |

The trade-off: an issue reassigned to someone else can stay in the list for up to 30 minutes. "Sync now" closes the gap on demand.

**Initial and incremental sync (Google Calendar)**

1. Per selected calendar, list events from 30 days ago onward, paging to the end. The final page returns a sync token.
2. Each later run sends only the sync token and receives changed and cancelled events since.
3. If Google answers 410 (token expired), the calendar's token is cleared and that calendar is fully resynced. Existing rows are matched by external id, so nothing is duplicated and local links survive.

**Applying an item (`SyncWriter`)**

| Link found? | Link state                 | Action                                             |
| ----------- | -------------------------- | -------------------------------------------------- |
| No          |                            | Insert the entity and the link. Index for search.  |
| Yes         | `synced`, remote unchanged | Update `lastSyncedAt` only                         |
| Yes         | `synced`, remote changed   | Update provider-owned fields only. Re-index.       |
| Yes         | `detached`                 | Skip                                               |
| Yes         | `removed`                  | Restore: state back to `synced`, unarchive, update |

"Unchanged" is decided by comparing `externalUpdatedAt`. This keeps `updatedAt` stable, so "recently updated" sorting is not flooded every 5 minutes. `createdAt` is set from the provider's creation time.

**Removal policy**

| Entity  | Has local links or a task note | Action                                                                                                |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Task    | Either                         | Archive (`archivedAt`), link state `removed`. Never purged in v1; it stays in the archive as history. |
| Project | Either                         | Archive, link state `removed`                                                                         |
| Event   | Yes                            | Keep the row, link state `removed`, hidden from the calendar                                          |
| Event   | No                             | Delete the row                                                                                        |

Archiving instead of deleting means an issue that is briefly unassigned and reassigned comes back with its notes intact.

**Telling the UI.** After each committed page the main process emits one event to the renderer: source, phase, counts and which entity types changed. The renderer refetches the affected queries. A second event carries source status for the settings page and a status indicator.

**Database concurrency.** `better-sqlite3` is synchronous, so each page's transaction briefly blocks the main process. At 50 items a page this is a few milliseconds. Turn on WAL (currently commented out in `Workspace.initDb`) before shipping background writes.

## Managing integrations

A workspace settings page lists each provider with its account, its sources, last sync time and any error. Four actions exist, and each has a defined effect on mirrored data.

| Action                  | Credentials                           | Syncing                       | Mirrored data                                    |
| ----------------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------ |
| Disable a source        | Kept                                  | Stops for that source         | Stays, frozen, with a "paused" hint on the badge |
| Enable a source         | Kept                                  | Resumes from the saved cursor | Catches up                                       |
| Disable the integration | Kept                                  | Stops for all its sources     | Stays, frozen                                    |
| Disconnect              | Revoked at the provider, then deleted | Stops                         | User chooses, below                              |

**Disconnect choices**

- **Remove synced items** (default). Synced tasks, projects and events are deleted. Items with local links or a task note, and mirrored projects that hold local tasks, are converted to detached local copies instead, so no note loses its target silently. The dialog states both counts before confirming.
- **Keep everything as local copies.** Every link becomes `detached`. `external_links.sourceId` goes null; the provider name and URL stay for the badge.

Reconnecting the same account later re-matches detached and removed links by `externalId` rather than creating duplicates.

**Connected but not a source.** An integration with all sources disabled is valid. It holds a working connection and syncs nothing. This is the state a future GitHub connection is in when used for version control only.

**Re-authentication.** In `needs_reauth`, the settings page and the status indicator show a "Reconnect" action that reruns the OAuth flow, or asks for a new API key, and keeps the same integration row, sources and cursors. If the returned account id differs, the reconnect is rejected.

**Deleting a workspace.** `WorkspaceService.delete` should revoke that workspace's tokens before removing the directory. Revocation is best effort; the delete proceeds if the network call fails.

## Core types and rules

These are the shapes and rules every module shares. They belong in `core/integrations/types.ts` and `core/sync/types.ts`.

**Normalised items.** What a provider adapter returns. Adapters map into these; `SyncWriter` only ever sees these.

```ts
interface ExternalTask {
  externalId: string; // provider's stable id
  key: string | null; // "ENG-123"
  url: string;
  title: string;
  description: string | null; // Markdown
  status: TaskStatus; // already mapped
  priority: TaskPriority; // already mapped
  statusLabel: string | null; // "In Review"
  priorityLabel: string | null; // "Urgent"
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null; // set only when status is COMPLETED
  createdAt: Date;
  updatedAt: Date; // drives the unchanged check
  parentExternalId: string | null;
  parentKey: string | null; // kept for display when the parent is not mirrored
  parentTitle: string | null;
  projectExternalId: string | null;
  assignedToViewer: boolean; // false in a lookup result means "remove"
}

interface ExternalProject {
  externalId: string;
  url: string;
  title: string;
  description: string | null;
  status: ProjectStatus; // already mapped
  statusLabel: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  color: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ExternalEvent {
  externalId: string; // "<calendarId>:<eventId>"; Google event ids are unique per calendar only
  calendarId: string;
  url: string;
  title: string;
  description: string | null; // Markdown, converted from HTML
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  timeZone: string | null; // IANA zone of the series
  location: string | null;
  recurrenceRule: string | null; // RFC 5545 lines joined with \n
  recurringEventExternalId: string | null; // set on a modified instance
  originalStartAt: Date | null; // the occurrence this instance replaces
  meetingUrl: string | null;
  color: string | null;
  response: 'accepted' | 'declined' | 'tentative' | 'needsAction' | null;
  cancelled: boolean;
  updatedAt: Date;
}
```

**Cursors and config.** Stored as JSON in `external_sources`. Validate with zod on read; an unreadable cursor is treated as null and triggers a fresh initial sync.

```ts
type LinearTaskCursor =
  | { mode: 'initial'; after: string | null; maxUpdatedAt: string | null }
  | { mode: 'incremental'; updatedSince: string }; // ISO time, already minus the 60 s overlap

interface GoogleEventCursor {
  calendars: Record<
    string,
    {
      // keyed by calendarId
      syncToken: string | null; // null until the first full pass ends
      pageToken: string | null; // resume point inside a pass
    }
  >;
}

interface GoogleEventConfig {
  calendarIds: string[];
}
type LinearTaskConfig = Record<string, never>; // nothing in v1
```

**Link metadata.** The JSON in `external_links.metadata`, by entity type.

| Entity  | Keys                                                                                |
| ------- | ----------------------------------------------------------------------------------- |
| Task    | `statusLabel`, `priorityLabel`, `parentExternalId`, `parentKey`, `parentTitle`      |
| Project | `statusLabel`                                                                       |
| Event   | `calendarId`, `timeZone`, `response`, `recurringEventExternalId`, `originalStartAt` |

**Identity rules**

- **Linear account id** is `<organizationId>:<userId>`. An API key or token belongs to one Linear workspace, and the same person can be in several. The label is "name, organisation".
- **Google account id** is the account's stable subject id; the label is the email.
- **Date-only values** (a Linear due date, a Google all-day event) are stored as local midnight, so the existing `dueOn` local-day filter matches them.

**Integration status transitions**

| From           | Event                                 | To             |
| -------------- | ------------------------------------- | -------------- |
| (none)         | Connect succeeds                      | `connected`    |
| `connected`    | User disables                         | `disabled`     |
| `disabled`     | User enables                          | `connected`    |
| `connected`    | Auth rejected, or token refresh fails | `needs_reauth` |
| `needs_reauth` | Reconnect with the same account       | `connected`    |
| any            | Disconnect                            | row deleted    |

**Link state transitions**

| From       | Event                                                                               | To         |
| ---------- | ----------------------------------------------------------------------------------- | ---------- |
| (none)     | Item first seen                                                                     | `synced`   |
| `synced`   | User detaches a task; disconnect keeping copies; project left with only local tasks | `detached` |
| `synced`   | Item left scope (reassigned, deleted, cancelled event)                              | `removed`  |
| `detached` | User reattaches a task; a detached project returns to scope                         | `synced`   |
| `removed`  | Item returns to scope                                                               | `synced`   |

A `detached` task never moves to `removed`; sync ignores it entirely.

**Error handling**

| Failure                                | Class                             | Engine response                                                |
| -------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| Credentials rejected, refresh fails    | `IntegrationAuthError`            | Integration to `needs_reauth`; stop scheduling; keep data      |
| Rate limited                           | `RateLimitError` with `retryAt`   | End the run; next attempt no earlier than `retryAt`            |
| Network failure, timeout, provider 5xx | `ProviderUnavailableError`        | End the run; exponential backoff                               |
| One item fails to map or validate      | logged, not thrown                | Skip that item, continue the page, count it in the run summary |
| Database error while applying a page   | rethrown                          | Page rolls back; run ends; backoff                             |
| Google sync token expired (410)        | handled in the adapter            | Clear that calendar's token; full resync of that calendar      |
| Encryption unavailable                 | `IntegrationAuthError` at connect | Connect refused with a message                                 |

Every HTTP request has a 30-second timeout through `AbortSignal`. Mutations rejected on synced rows throw `ExternalReadOnlyError`.

**Constants.** One file, `core/sync/constants.ts`, so they are easy to tune.

| Constant                                  | Value                                |
| ----------------------------------------- | ------------------------------------ |
| Incremental interval                      | 5 minutes                            |
| Reconcile interval (Linear)               | 30 minutes                           |
| Minimum gap for focus and resume triggers | 60 seconds                           |
| Page size                                 | 50                                   |
| Lookup batch size                         | 100 ids                              |
| Closed-issue window and settle age        | 30 days                              |
| Event history window                      | 30 days back                         |
| Cursor overlap                            | 60 seconds                           |
| Backoff                                   | 1 minute doubling to a 30-minute cap |
| HTTP timeout                              | 30 seconds                           |
| OAuth callback timeout                    | 5 minutes                            |
| Token refresh margin                      | 60 seconds before expiry             |

**Logging.** Use `electron-log` as the rest of the app does. Log one line per run: source, mode, pages, counts of inserted, updated, removed and skipped, duration, and outcome. Never log credentials, authorization headers, the API key argument of `integrations:connect`, or item titles and descriptions.

## Provider reference

Checked against each provider's documentation on 6 October 2026. Items marked "from memory" were not on the pages read and must be confirmed against the live schema or console.

### Linear

| Topic                 | Fact                                                                                                                                                    | Source                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Endpoint              | `https://api.linear.app/graphql`                                                                                                                        | [Getting started](https://linear.app/developers/graphql)            |
| API key header        | `Authorization: <API_KEY>`, with no `Bearer` prefix                                                                                                     | [Getting started](https://linear.app/developers/graphql)            |
| OAuth token header    | `Authorization: Bearer <ACCESS_TOKEN>`                                                                                                                  | [OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication) |
| Account query         | `viewer { id name email }`                                                                                                                              | [Getting started](https://linear.app/developers/graphql)            |
| Request limit         | 2,500 per hour with an API key; 5,000 per hour with OAuth                                                                                               | [Rate limiting](https://linear.app/developers/rate-limiting)        |
| Complexity limit      | 3,000,000 points per hour with an API key; 10,000 points for one query                                                                                  | [Rate limiting](https://linear.app/developers/rate-limiting)        |
| Rate-limited response | HTTP 400 with a GraphQL error whose `extensions.code` is `RATELIMITED`. Not a 429                                                                       | [Rate limiting](https://linear.app/developers/rate-limiting)        |
| Rate-limit headers    | `X-RateLimit-Requests-Remaining`, `X-RateLimit-Requests-Reset`, `X-RateLimit-Complexity-Remaining`, `X-RateLimit-Complexity-Reset`                      | [Rate limiting](https://linear.app/developers/rate-limiting)        |
| Pagination            | `first` and `after`; `pageInfo { hasNextPage endCursor }`; default page size 50                                                                         | [Pagination](https://linear.app/developers/pagination)              |
| Ordering              | `orderBy: updatedAt` or `createdAt` (default)                                                                                                           | [Pagination](https://linear.app/developers/pagination)              |
| Archived items        | Hidden unless `includeArchived: true` is passed                                                                                                         | [Getting started](https://linear.app/developers/graphql)            |
| Filters               | `state: { type: { in: [...] } }`, `updatedAt: { gt: "<ISO>" }`, `id: { in: [...] }`, `or: [...]`; several fields in one filter are combined with AND    | [Filtering](https://linear.app/developers/filtering)                |
| Relative dates        | ISO 8601 durations, such as `completedAt: { gt: "-P30D" }`                                                                                              | [Filtering](https://linear.app/developers/filtering)                |
| OAuth endpoints       | Authorize `https://linear.app/oauth/authorize`; token `https://api.linear.app/oauth/token`; revoke `https://api.linear.app/oauth/revoke`                | [OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication) |
| OAuth details         | PKCE supported, client secret optional with PKCE; scopes comma-separated, `read` is the default; access tokens last 24 hours; refresh tokens are issued | [OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication) |

**What this changes in the design**

- The Linear client must detect rate limiting from the response body, not the status code, and take the retry time from `X-RateLimit-Requests-Reset`.
- Request budget: 12 incremental runs and 2 reconcile passes an hour is under 20 requests an hour against a limit of 2,500.
- Linear's documentation discourages polling and recommends webhooks. Webhooks need a public endpoint, which a local-first desktop app does not have, so v1 polls lightly and filters by `updatedAt` as the same page advises.
- Linear's OAuth scopes are comma-separated and Google's are space-separated, which is why `OAuthConfig` carries a scope separator.

**Query shape for the incremental pull.** Field names in the selection are from memory; confirm each in Linear's schema explorer and capture the result as a fixture.

```graphql
query AssignedIssues($after: String, $since: DateTimeOrDuration) {
  viewer {
    assignedIssues(
      first: 50
      after: $after
      orderBy: updatedAt
      includeArchived: true
      filter: { updatedAt: { gt: $since } }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        url
        title
        description
        priority
        priorityLabel
        dueDate
        startedAt
        completedAt
        canceledAt
        createdAt
        updatedAt
        archivedAt
        trashed
        state {
          name
          type
        }
        parent {
          id
          identifier
          title
        }
        project {
          id
          name
          description
          url
          state
          startDate
          targetDate
          color
          updatedAt
        }
      }
    }
  }
}
```

- **Initial pull:** the same query with the filter `or: [{ state: { type: { nin: ["completed", "canceled"] } } }, { completedAt: { gt: "-P30D" } }, { canceledAt: { gt: "-P30D" } }]`.
- **Assignment snapshot:** `viewer.assignedIssues` selecting `id` only, filtered to open state types.
- **Lookup:** `issues(filter: { id: { in: [...] } }, includeArchived: true)` selecting the same fields plus `assignee { id }`.

**From memory, to confirm:** state types are `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`; priority numbers are 0 none, 1 urgent, 2 high, 3 medium, 4 low; project states are `backlog`, `planned`, `started`, `paused`, `completed`, `canceled`; `dueDate` is a date-only string.

### Google Calendar

| Topic            | Fact                                                                                                                                                 | Source                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| OAuth endpoints  | Authorize `https://accounts.google.com/o/oauth2/v2/auth`; token `https://oauth2.googleapis.com/token`; revoke `https://oauth2.googleapis.com/revoke` | [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) |
| Redirect         | `http://127.0.0.1:<port>` on any free port; a path is optional                                                                                       | [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) |
| PKCE             | `code_challenge` with `code_challenge_method=S256`, recommended                                                                                      | [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) |
| Client secret    | Optional in the token exchange for desktop clients                                                                                                   | [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) |
| Refresh tokens   | Always returned for installed applications; refresh with `grant_type=refresh_token`                                                                  | [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) |
| Scopes           | `calendar.calendarlist.readonly` to list calendars and `calendar.events.readonly` to read events. Both are narrower than `calendar.readonly`         | [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)             |
| Initial sync     | A list request may be restricted, for example with `timeMin`. `nextSyncToken` arrives on the last page only                                          | [Synchronize resources](https://developers.google.com/workspace/calendar/api/guides/sync)    |
| Incremental sync | Send the stored `syncToken`. Keep the other query parameters the same as the initial request                                                         | [Synchronize resources](https://developers.google.com/workspace/calendar/api/guides/sync)    |
| Deletions        | Incremental responses always include deleted entries                                                                                                 | [Synchronize resources](https://developers.google.com/workspace/calendar/api/guides/sync)    |
| Expired token    | HTTP 410. Wipe that calendar's stored state and run a full sync                                                                                      | [Synchronize resources](https://developers.google.com/workspace/calendar/api/guides/sync)    |

**What this changes in the design**

- Use the two narrow scopes, not `calendar.readonly`. The authentication table above is superseded on this point.
- The 30-day lower bound on the initial events request is supported.
- `timeMin` is sent only on a full sync, and `syncToken` only on an incremental one. Every other parameter (`singleEvents=false`, `showDeleted`, page size) must be identical on both, so build both requests from one function.

**Request shapes**

- **Calendar list:** `GET https://www.googleapis.com/calendar/v3/users/me/calendarList`.
- **Full sync:** `GET .../calendars/{calendarId}/events?singleEvents=false&maxResults=250&timeMin=<now minus 30 days>`, following `nextPageToken` to the end.
- **Incremental:** the same request with `syncToken=<stored>` and no `timeMin`.

Paths and parameter names here are from memory of the v3 API; confirm against the events reference when writing the client.

**From memory, to confirm:** whether these scopes are classed as sensitive and so need app verification; whether refresh tokens expire after 7 days while the OAuth consent screen is in testing status; the `status: "cancelled"` marker and the `recurringEventId` and `originalStartTime` fields on instances.

## Changes required

Most work is new code. Changes to existing files are small but touch every entity service.

**New**

| Path                                                    | Contents                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/main/db/schema/integrations.ts`                    | `integrations`, `external_sources`, `external_links`                             |
| `src/main/db/migrations/0016_*`                         | New tables; rebuild of `tasks` and `projects` for nullable `dueDate`             |
| `src/main/core/integrations/`                           | `service.ts`, `types.ts`, `credentials.ts`, `oauth/pkce.ts`, `oauth/loopback.ts` |
| `src/main/core/integrations/providers/linear/`          | `client.ts` (GraphQL over `fetch`), `mapper.ts`, `provider.ts`                   |
| `src/main/core/integrations/providers/google-calendar/` | `client.ts`, `mapper.ts`, `provider.ts`                                          |
| `src/main/core/sync/`                                   | `engine.ts`, `writer.ts`, `scheduler.ts`, `types.ts`                             |
| `src/main/core/tests/integrations/`, `.../sync/`        | Tests and provider fixtures                                                      |

**Modified**

| File                                                          | Change                                                                                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/ids.ts`                                           | Add `integration`, `externalSource`, `externalLink` entity types and prefixes                                                                                                                             |
| `core/shared/errors.ts`                                       | Add `ExternalReadOnlyError`, `IntegrationAuthError`                                                                                                                                                       |
| `db/schema/tasks.ts`, `projects.ts`                           | `dueDate` nullable                                                                                                                                                                                        |
| `core/tasks/types.ts`, `projects/types.ts`, `events/types.ts` | `dueDate: Date \| null`; optional `external: ExternalRef`; `origin` filter                                                                                                                                |
| `core/tasks/service.ts`                                       | Read-only guards on mutations; depth guards scoped to local tasks; ref lookup for `external`; null due dates sort last; CANCELLED status in filters and sorting; local tasks allowed in mirrored projects |
| `core/projects/service.ts`                                    | Read-only guards; ref lookup; overdue stats ignore null due dates; cancelled tasks counted separately                                                                                                     |
| `core/events/service.ts`                                      | Read-only guards; ref lookup; `listEventsInRange` hides `removed`                                                                                                                                         |
| `core/archive/service.ts`                                     | Reject archiving synced items; `listArchived` labels removed external items                                                                                                                               |
| `core/search/service.ts`                                      | Add removal from the index by entity id, if not already present                                                                                                                                           |
| `core/workspace/workspace.ts`                                 | Construct `IntegrationService` and `SyncScheduler`; enable WAL; stop the scheduler in `close()`                                                                                                           |
| `core/workspace/service.ts`                                   | Revoke tokens on workspace delete                                                                                                                                                                         |
| `core/settings/schema.ts`                                     | No change. Integration state is per workspace, not global settings                                                                                                                                        |
| `src/main/index.ts`                                           | Pass `safeStorage`, `fetch` and `shell.openExternal` into core; forward window focus and `powerMonitor` resume to the scheduler; forward sync events to the renderer                                      |
| `src/preload/index.ts`                                        | Expose a sync event subscription                                                                                                                                                                          |
| `src/common/ipc.ts`                                           | Proposed home for the shared channel contract below, imported by main, preload and renderer                                                                                                               |
| `.env.template`                                               | `DEV_LINEAR_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                                                          |

**IPC contract (deferred).** Not part of the current build. IPC will be implemented separately with a dedicated typed solution. The shapes below record what the integration feature will need from it: request channels the renderer invokes and push events the main process sends. Treat them as requirements to fit to that solution, not as its design. Until then, the same operations are plain methods and in-process events on the core services.

```ts
// request/response
interface IntegrationChannels {
  'integrations:list': () => Integration[];
  // API key: resolves after validation. OAuth: resolves when the loopback flow ends
  'integrations:connect': (input: { provider: Provider; apiKey?: string }) => Integration;
  'integrations:cancelConnect': (input: { provider: Provider }) => void;
  'integrations:setEnabled': (input: { id: IntegrationId; enabled: boolean }) => Integration;
  'integrations:disconnect': (input: { id: IntegrationId; keepLocalCopies: boolean }) => void;

  'sources:setEnabled': (input: { id: ExternalSourceId; enabled: boolean }) => ExternalSource;
  'sources:listCalendars': (input: { id: ExternalSourceId }) => ExternalCalendar[];
  'sources:setCalendars': (input: {
    id: ExternalSourceId;
    calendarIds: string[];
  }) => ExternalSource;

  'sync:now': (input: { sourceId?: ExternalSourceId }) => void;
  'tasks:detach': (input: { id: TaskId }) => Task;
  'tasks:reattach': (input: { id: TaskId }) => Task;
}

// push events
interface IntegrationEvents {
  'sync:progress': {
    sourceId: ExternalSourceId;
    phase: 'initial' | 'incremental' | 'reconcile';
    itemsApplied: number;
    changed: ('task' | 'project' | 'event')[]; // what the renderer should refetch
  };
  'sources:changed': ExternalSource; // enabled, lastSyncedAt, lastError
  'integrations:changed': Integration; // status, such as needs_reauth
}

interface Integration {
  id: IntegrationId;
  provider: Provider;
  authType: 'oauth' | 'api_key';
  accountLabel: string;
  status: 'connected' | 'disabled' | 'needs_reauth';
  sources: ExternalSource[];
}

interface ExternalSource {
  id: ExternalSourceId;
  sourceType: 'tasks' | 'events' | 'version_control';
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}
```

Existing task, project and event payloads gain the optional `external: ExternalRef` field from the data model section. No channel ever returns credentials.

**UI (deferred).** Not part of the current build. What the views will need once they exist:

- Settings: integrations page with connect, reconnect, enable, disable, disconnect and calendar selection.
- Task and project lists: provider icon and key on external rows, a filter for origin, disabled edit controls with an "Open in Linear" action.
- Task detail: read-only fields, Linear's own status and priority labels, detach and reattach.
- Calendar: synced events styled by calendar colour, declined events dimmed.
- Global: a small sync status indicator with last sync time, errors and "Sync now".

## Alternatives and trade-offs

Each decision below lists the chosen option first.

**1. Where external items are stored**

| Option                                             | Pros                                                                                  | Cons                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mirror into `tasks`, `projects`, `events` (chosen) | One list query, one search index, existing links and foreign keys work, fully offline | Existing constraints must loosen (`dueDate`, subtask depth); every mutation needs a read-only guard    |
| Separate `external_tasks` tables                   | Local schema untouched; no guards needed                                              | Every view unions two tables; notes need a second link column; search and project stats are duplicated |
| Fetch live, store nothing                          | No sync engine, never stale                                                           | No offline use, no linking, no search, slow lists, rate-limit exposure                                 |

**2. Where external identity lives**

| Option                               | Pros                                                                                                                     | Cons                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `external_links` side table (chosen) | Entity tables stay clean; one place for sync state; one lookup path for the writer; new entity types need no new columns | A join on every list read; polymorphic row needs a `CHECK`                                        |
| Columns on each entity table         | No join; simple filters                                                                                                  | Six or more columns repeated on three tables; three table rebuilds; local rows carry dead columns |

**3. Where integrations are stored**

| Option                                        | Pros                                                                                       | Cons                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Workspace `db.sqlite` (chosen)                | Scoping is automatic; deleting a workspace deletes its integrations; foreign keys to links | Ciphertext is copied into `db.sqlite.backup`; a workspace moved to another machine must reconnect |
| Global `electron-store` keyed by workspace id | Credentials stay out of workspace files                                                    | Two stores to keep consistent; orphaned entries when a workspace is deleted; no foreign keys      |

**4. Credential protection**

| Option                                           | Pros                                                             | Cons                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `safeStorage` ciphertext in SQLite (chosen)      | Built into Electron; OS keychain holds the key; no native module | Weaker on Linux without a keyring; tied to the machine and OS user                    |
| OS keychain entry per integration (keytar-style) | Secrets never touch the database                                 | Extra native dependency to rebuild alongside `better-sqlite3`; keytar is unmaintained |
| Plain text in the database                       | Trivial                                                          | Any copy of the file leaks tokens                                                     |

**5. Linear authentication for v1**

| Option                               | Pros                                                                | Cons                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API key now, OAuth deferred (chosen) | Sync work starts now; no app registration or fixed ports needed yet | Poor onboarding; keys are long-lived and carry the user's full access, not just read |
| OAuth only                           | One path; read-only scope; better UX                                | Blocks on registering the app and confirming PKCE and loopback rules                 |

**6. Change detection**

| Option                        | Pros                                                          | Cons                                                                           |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Polling with cursors (chosen) | Works from a desktop app with no server; simple failure model | Up to 5 minutes stale; needs extra queries to see removals                     |
| Webhooks                      | Near real time                                                | Needs a public endpoint, so a hosted relay; out of scope for a local-first app |
| Full refetch every run        | No cursor logic                                               | Wasteful; hits rate limits on large accounts                                   |

**7. Recurring Google events**

| Option                           | Pros                                                                                    | Cons                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Store series with rules (chosen) | One row per series; matches the existing column and query; infinite series cost nothing | Exceptions need `EXDATE` handling; time-zone care in expansion                                         |
| Store expanded instances         | Each row is a plain event; simpler rendering and linking per occurrence                 | Needs a forward window that must be rolled; many rows; a note links to one instance only by convention |

**8. Statuses and priorities**

| Option                                                             | Pros                                                                                                                | Cons                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Map to DevBrain enums, keep raw label, add CANCELLED only (chosen) | Sorting, grouping and stats keep working; cancelled work is not shown as done; the user still sees Linear's wording | "Urgent" and "High" sort together; a new status touches local task views, filters and stats |
| Map to the existing three statuses                                 | No change to local tasks                                                                                            | Cancelled issues count as completed and inflate progress                                    |
| Also add URGENT                                                    | More faithful priorities                                                                                            | Changes local priority settings and defaults for little gain                                |
| Per-source custom status tables                                    | Fully faithful                                                                                                      | Large UI and query cost for v1                                                              |

**9. Removed items**

| Option                              | Pros                                                             | Cons                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Archive and mark `removed` (chosen) | Reversible; notes keep their target; survives brief reassignment | Archive view gains external items; the archive grows until a later version adds cleanup |
| Hard delete                         | Mirror is always exact                                           | Linked notes lose their target silently; no undo                                        |

## Risks, security and privacy

The two risks most likely to cost time are Google's OAuth verification and the `dueDate` migration.

| Risk                                                    | Impact                                                                                       | Mitigation                                                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Google treats calendar read access as a sensitive scope | Unverified apps show a warning screen and are capped on user count; verification takes weeks | Start the consent-screen and verification process in phase 1, not at launch. Use test users until then.             |
| Nullable `dueDate` breaks assumptions                   | Sorting, `dueOn` filters, overdue stats and any UI that formats the date                     | Change the TypeScript type first and let the compiler find every use. Add tests for null ordering.                  |
| Table rebuild migration on real workspaces              | Data loss if the rebuild fails midway                                                        | `Workspace.open` already backs up before migrating. Add a migration test against a seeded database.                 |
| Linear OAuth cannot use a random loopback port          | Port clash blocks login                                                                      | Register three fixed ports and try each in turn.                                                                    |
| Credentials at rest                                     | Token theft from a copied database                                                           | `safeStorage`; refuse to connect when encryption is unavailable; never log tokens or auth headers.                  |
| Malicious local process hits the loopback listener      | Forged callback                                                                              | Bind to `127.0.0.1`; verify `state`; PKCE makes a stolen code useless; single-use listener with a timeout.          |
| Remote content rendered in the app                      | Script injection through a Linear description or Google event HTML                           | Convert Google HTML to Markdown and sanitise on render. The renderer already runs sandboxed with context isolation. |
| Rate limits on large accounts                           | Initial sync stalls                                                                          | Page size 50, sequential pages, honour retry headers, resume from the committed cursor.                             |
| Sync writes block the main process                      | UI jank during initial sync                                                                  | Small page transactions; WAL; yield between pages. Move to a worker thread only if measured.                        |
| Stale data shown as current                             | User acts on outdated status                                                                 | Last-synced time on the indicator; clear "paused" and "reconnect" states.                                           |
| Private work data stored locally                        | Mirrored issues and meetings sit in the workspace folder                                     | State it in the connect dialog. Disconnect offers full removal.                                                     |
| API key grants more than read                           | A leaked key can write to Linear                                                             | Label the API key path as temporary; push users to OAuth once it ships.                                             |

## Implementation plan

Six phases, each mergeable and tested by itself. Phases 1 to 3 need no UI and follow the repo's current service-plus-tests pattern.

The step-by-step breakdown of every feature is in Implementation breakdown.

1. **Foundations.** Schema and migration for the three tables. Nullable `dueDate` with every caller fixed. New id prefixes and errors. `ExternalRef` on read models. Read-only guards in the task, project, event and archive services. Enable WAL.
2. **Integrations and credentials.** `IntegrationService`, `CredentialStore` with the injected cipher, Linear API key connect and validation, enable, disable, disconnect.
3. **Sync engine with Linear tasks.** Linear client and mapper, `SyncWriter`, `SyncEngine`, initial and incremental sync, reconcile, removal policy, search indexing, detach and reattach.
4. **Scheduler and app wiring.** `SyncScheduler`, focus and resume triggers in `src/main/index.ts`, renderer events, typed IPC channels and handlers.
5. **OAuth and Google Calendar.** PKCE and loopback module, Google provider with calendar selection, sync tokens and recurring events. Linear OAuth is deferred.
6. **UI.** Integrations settings page, badges and read-only states, sync indicator, disconnect dialog.

The IPC part of phase 4 and all of phase 6 are deferred. Phase 4 in the current build is the scheduler and the main-process wiring only.

Start Google's OAuth verification during phase 1; it is the only item with an external lead time.

**Testing**

- **Mappers**: unit tests against recorded Linear and Google payloads, covering every state type, priority, all-day events and recurrence exceptions.
- **`SyncWriter`**: in-memory SQLite, as the existing service tests do. Cases: insert, unchanged skip, update preserves links, detached skip, remove, restore, parent-before-child, project move.
- **`SyncEngine`**: a fake provider scripted with pages and failures. Cases: crash between pages resumes, 401, rate limiting, expired Google token.
- **Scheduler**: Vitest fake timers for interval, focus debounce, coalescing and backoff.
- **Guards**: each mutation on a synced row throws; the same call on a detached row succeeds.
- **Migration**: run against a seeded pre-migration database and compare row counts and indexes.
- **OAuth loopback**: real listener on a test port; cases for wrong state, timeout and happy path.
- **Manual**: one end-to-end pass against a real Linear workspace and Google account before each release.

## Open questions

**Product decisions**

None open.

**Decided on 2 October 2026**

| Question                               | Decision                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Cancelled Linear issues                | Shown with a new CANCELLED task status                                                       |
| Separate "Urgent" priority             | No. Urgent groups with High                                                                  |
| Sub-issue whose parent is not mirrored | Shown as a top-level task                                                                    |
| Declined calendar events               | Shown dimmed                                                                                 |
| Hiding a synced task without detaching | Not in v1                                                                                    |
| Local tasks in mirrored projects       | Allowed. They stay local and are never synced back                                           |
| Purge window for removed items         | Never in v1. Removed items stay archived as history; cleanup is revisited in a later version |
| `tasks.pullRequestUrl`                 | Kept. Local tasks can carry a URL with no integration                                        |
| Required due date for local projects   | Yes, enforced in the service, not the schema                                                 |

**To verify against provider documentation before building**

- [ ] Linear: the exact field names in the issue and project selections, the state type and priority values, and whether `dueDate` is date-only. Confirm in the schema explorer while recording fixtures.
- [ ] Linear (only when OAuth is picked up): are `http://127.0.0.1:<port>` redirect URIs accepted, and must the port match a registered URI exactly?
- [ ] Google: are `calendar.events.readonly` and `calendar.calendarlist.readonly` classed as sensitive, and what verification does that require?
- [ ] Google: do refresh tokens expire after 7 days while the consent screen is in testing status?
- [ ] Google: the cancelled-instance marker and the fields that tie a modified instance to its series.

Resolved on 6 October 2026 and recorded in the provider reference: Linear PKCE, token lifetime, rate limits and filter syntax; Google's time bound on the first sync and its narrower scopes.

**Engineering**

- [ ] Does background sync need to continue when the window is closed but the app is running (macOS)?
- [ ] Add a time-zone column to `events` now, or keep the series time zone in link metadata for v1?

* [ ] Revisit later: `SyncWriter` writes entity tables directly, alongside `TaskService` and `ArchiveService`. Should row writes be unified, through per-entity stores or service-owned row writers?
