import type { ChangedEntity } from './changes';
import type { ExternalSourceId, IntegrationId, WorkspaceId } from './ids';

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
  // the open workspace, or null once it has closed
  'workspace.changed': { id: WorkspaceId | null };
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
