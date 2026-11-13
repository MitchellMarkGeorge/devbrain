import type { ExternalSourceId, IntegrationId, TaskId } from '../ids';

// The integration types the renderer needs, to show connections, their sources, their sync status
// and the badge on a synced row.

// string values, as they are stored in the integration tables' text columns

export enum Provider {
  LINEAR = 'linear',
  GOOGLE_CALENDAR = 'google_calendar',
}

export enum SourceType {
  TASKS = 'tasks',
  EVENTS = 'events',
  // reserved in the schema only; no provider serves it in v1
  VERSION_CONTROL = 'version_control',
}

export enum AuthType {
  OAUTH = 'oauth',
  API_KEY = 'api_key',
}

export enum IntegrationStatus {
  CONNECTED = 'connected',
  DISABLED = 'disabled',
  NEEDS_REAUTH = 'needs_reauth',
}

export enum LinkState {
  // provider-owned and read-only
  SYNCED = 'synced',
  // a local copy that remembers where it came from, ignored by sync
  DETACHED = 'detached',
  // left scope (archived, or hidden for events), restored if it returns
  REMOVED = 'removed',
}

// what the rest of the app sees of a connection: never the credentials
export interface Integration {
  id: IntegrationId;
  provider: Provider;
  authType: AuthType;
  accountLabel: string;
  status: IntegrationStatus;
  sources: ExternalSource[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalSource {
  id: ExternalSourceId;
  sourceType: SourceType;
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  // after a rate-limited run, the provider's stated retry time; null otherwise
  retryAt: Date | null;
}

// the `external` field on Task, Project and Event read models
export interface ExternalRef {
  provider: Provider;
  state: LinkState;
  key: string | null; // ENG-123
  url: string;
  statusLabel: string | null; // "In Review"
  priorityLabel: string | null; // "Urgent"
  lastSyncedAt: Date;
}

// one source's sync state, for a status indicator and the settings page (sync.status)
export interface SourceSyncStatus {
  sourceId: ExternalSourceId;
  integrationId: IntegrationId;
  provider: Provider;
  sourceType: SourceType;
  // the integration's status; a source syncs only while it is connected
  status: IntegrationStatus;
  enabled: boolean;
  // a run is in flight
  running: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  retryAt: Date | null;
}

// the entity types a write touched, so the renderer refetches only those queries
export type SyncEntityType = 'task' | 'project' | 'event' | 'calendar';

export interface EntityCounts {
  tasks: number;
  projects: number;
  events: number;
}

// counts of mirrored items, synced or removed: detached ones are already local and never touched
export interface DisconnectCounts {
  // deleted with their links
  deleted: EntityCounts;
  // kept as local copies: synced ones are detached, removed (archived or hidden) ones stay so
  kept: EntityCounts;
}

// Tasks a disconnect kept as local copies that came back to an account connected again: the next
// sync matched them to its tasks source, and they stay detached until reattached (or left local)
export interface KeptCopies {
  tasks: number;
}

// what reattaching an account's kept copies did
export interface ReattachKeptResult {
  // tasks synced again, subtasks included
  reattached: number;
  // the kept tasks, each with its subtasks, that stay local copies, and why
  failed: { taskId: TaskId; message: string }[];
}

export interface DisconnectResult extends DisconnectCounts {
  changed: SyncEntityType[];
  // whether the provider confirmed the grant revoked; false for an API key, which has nothing to
  // revoke, and when revoking failed or timed out
  revoked: boolean;
}
