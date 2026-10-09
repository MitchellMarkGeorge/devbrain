import {
  AuthType,
  ExternalProject,
  ExternalTask,
  GoogleEventConfig,
  GoogleEventCursor,
  LinearTaskConfig,
  LinearTaskCursor,
  Provider as ProviderId,
  SourceType,
} from '../types';
import { Auth } from '../auth';

// The provider contract. Adapters are pure with respect to the database: they return normalised
// items and the engine decides what to write. Implementations are looked up through the registry in
// ./registry. OAuth config and event sources come with feature 16.

// who a credential belongs to, from the provider's own account query
export interface ExternalAccount {
  // unique per provider; stored in integrations.accountId
  accountId: string;
  // shown in settings, e.g. "Ada Lovelace, Acme"
  label: string;
  // the provider's id for the user, used to tell whether an item is assigned to them
  userId: string;
}

// opaque to the engine: stored as JSON and handed back on the next call
export type SyncCursor = LinearTaskCursor | GoogleEventCursor;
export type SourceConfig = LinearTaskConfig | GoogleEventConfig;

export interface TaskPage {
  tasks: ExternalTask[];
  // the projects of the page's tasks, each once
  projects: ExternalProject[];
  // items in scope that the provider reports as gone, e.g. trashed
  removedIds: string[];
  nextCursor: SyncCursor;
  done: boolean;
  // items that failed to validate or map; left out of the page and counted in the run summary
  skipped: number;
}

export interface LookupResult {
  // a task with assignedToViewer false has been reassigned and should be removed
  tasks: ExternalTask[];
  // ids that no longer resolve, or resolve to a trashed item
  gone: string[];
  skipped: number;
}

export interface TaskSource {
  // One page per call; a null or unreadable cursor starts a fresh initial sync.
  //
  // `config` is the source's settings from external_sources.config: what the user chose to sync,
  // as opposed to the cursor, which is where the last run stopped. No task provider reads it in v1
  // (Linear syncs every issue assigned to the viewer, so its config is empty), and an
  // implementation may leave the parameter off. It is part of the contract so a provider that
  // needs a choice from the user can take one without changing the engine, for example:
  // - Linear: only issues from the teams the user picks
  // - GitHub issues: only the repositories the user picks
  // Events sources already work this way: Google Calendar's config is the selected calendarIds.
  pull(auth: Auth, cursor: SyncCursor | null, config: SourceConfig): Promise<TaskPage>;
  // ids of open items currently assigned to the user (id field only)
  listAssignedIds(auth: Auth): Promise<string[]>;
  // current state of specific items; ids that no longer resolve are gone
  lookup(auth: Auth, externalIds: string[]): Promise<LookupResult>;
}

export interface Provider {
  id: ProviderId;
  // the source types a connection gets, one external_sources row each
  supports: SourceType[];
  // how an account can be connected; connectWithApiKey refuses a provider without API_KEY
  authMethods: AuthType[];
  getAccount(auth: Auth): Promise<ExternalAccount>;
  tasks?: TaskSource;
}

// What adapters need from fetch: a URL string and an init. Kept this narrow so Electron's
// net.fetch (which takes no URL object) fits, as do Node's global fetch and the fakes in tests.
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
