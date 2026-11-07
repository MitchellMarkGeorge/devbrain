import type { ChangedEntity } from './changes';
import type { ExternalSourceId, IntegrationId } from './ids';
import type { WorkspaceSnapshot } from './types';

// The events main pushes to the renderer, by name. Each is a delta: it says what changed, and the
// renderer refetches what it shows rather than applying a snapshot.
export interface AppEvents {
  // rows changed outside any mutation's response
  'db.changes': { entities: ChangedEntity[] };
  // after each page a sync run commits
  'sync.progress': {
    sourceId: ExternalSourceId;
    phase: SyncPhase;
    // inserted, updated and removed so far in this run
    itemsApplied: number;
  };
  'integrations.changed': { integrationId: IntegrationId; type: IntegrationChangeType };
  // a source's sync status or settings changed
  'sources.changed': { sourceId: ExternalSourceId };
  // The workspace state, whole, at every change: onboarding (`none`), the splash (`opening`) or
  // the app (`open`). Not a delta: the renderer shows what it says. A switch sends two: the new
  // one opening, then it open (or the old one open again, with the error, when it failed before
  // closing anything).
  'workspace.changed': WorkspaceSnapshot;
}

export type AppEventName = keyof AppEvents;

// core's SyncMode values
export type SyncPhase = 'initial' | 'incremental' | 'reconcile';

// core's IntegrationChange types
export type IntegrationChangeType =
  | 'connected'
  | 'status_changed'
  | 'source_changed'
  | 'disconnected';
