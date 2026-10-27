import type { ExternalSourceId, IntegrationId } from './ids';

// The integration types the renderer needs, to show connections, their sources and the badge on a
// synced row. Core's integrations/types re-exports all of it, and core imports from there.

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
