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

`SyncMode`, `SyncRunOutcome` and `SyncSkipReason` in `src/main/core/sync/types.ts` are string enums, matching `Provider`, `SourceType` and the other enums in `src/main/core/integrations/types.ts`. `SyncEntityType` (`'task' | 'project'`) in the same file is still a union. It comes from the writer (feature 9), so converting it means changing `src/main/core/sync/writer.ts` and its tests too. The values would stay the same, so progress events and anything forwarding them are unaffected.
