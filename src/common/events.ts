import type { ChangedEntity } from './changes';
import type { ExternalSourceId, IntegrationId, WorkspaceId } from './ids';
import type { TransferReport } from './types/transfer';

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
  // An app menu item that runs one of the window's commands (New Task, Find…, Go to › Tasks), sent
  // to the window it was picked in. `command` is the keyboard layer's command id, so the menu and
  // the keys do the same thing; `workspaceId` is the workspace open in main when it was picked, and
  // a window showing another drops it.
  'app.command': { command: MenuCommandId; workspaceId: WorkspaceId };
  // An import or export the app menu ran has finished, in `workspaceId`: the window shows the same
  // summary dialog or toast as the Settings buttons. Names files, never their paths.
  'transfer.completed': { workspaceId: WorkspaceId; report: TransferReport };
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

// The pages the menu's Go to submenu opens, as the keyboard layer's `nav.<page>` commands name them
export type MenuPage =
  | 'home'
  | 'tasks'
  | 'projects'
  | 'notes'
  | 'calendar'
  | 'integrations'
  | 'settings'
  | 'trash';

// The keyboard layer's commands the app menu runs (src/renderer/keyboard/default-keymap.ts)
export type MenuCommandId = 'task.new' | 'note.new' | 'search.open' | `nav.${MenuPage}`;
