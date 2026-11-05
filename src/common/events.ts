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
  // Which workspace is open (null while none is), and which is opening (null when none is). From
  // `opening` set until `id` is it, the app shows its splash; with neither, it shows the picker.
  // A switch sends three: the new one opening, then the old one closed, then the new one open.
  'workspace.changed': { id: WorkspaceId | null; opening: WorkspaceId | null };
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
