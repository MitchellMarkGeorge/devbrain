import {
  AuthType,
  ExternalCalendar,
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  GoogleEventCursor,
  LinearTaskConfig,
  LinearTaskCursor,
  Provider as ProviderId,
  SourceType,
} from '../types';
import { Auth } from '../auth';
import { OAuthConfig } from '../oauth/types';

// The provider contract. Adapters are pure with respect to the database: they return normalised
// items and the engine decides what to write. Implementations are looked up through the registry in
// ./registry.
//
// Adapters are also stateless. The registry holds one instance of each provider for the whole app,
// shared by every account connected to it and by runs that may interleave, so a call must work only
// from its arguments (auth, cursor, and what the engine hands it) and keep nothing between calls:
// no cache, no per-run field. Progress that has to outlive a call goes in the returned cursor, which
// the engine stores and hands back; anything else a run needs is passed in by the engine.

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
export type SourceConfig = LinearTaskConfig;

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

export interface LookupOptions {
  // containers to check as well, such as Linear projects; what resolves comes back in `projects`
  projectIds?: string[];
}

export interface LookupResult {
  // a task with assignedToViewer false has been reassigned and should be removed
  tasks: ExternalTask[];
  // the projects of the found tasks, and the requested projects that resolved, each once
  projects: ExternalProject[];
  // ids that no longer resolve, or resolve to a trashed item
  gone: string[];
  // requested project ids that no longer resolve, or resolve to a trashed project
  goneProjects: string[];
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
  // Events sources are told what to sync the same way, as the selected calendars, which the engine
  // reads from the calendars table.
  //
  // Stateless, like every adapter call: see the note at the top of this file.
  pull(auth: Auth, cursor: SyncCursor | null, config: SourceConfig): Promise<TaskPage>;
  // ids of open items currently assigned to the user (id field only)
  listAssignedIds(auth: Auth): Promise<string[]>;
  // current state of specific items, and of the projects in `options`; ids that no longer resolve
  // are gone
  lookup(auth: Auth, externalIds: string[], options?: LookupOptions): Promise<LookupResult>;
}

export interface EventPage {
  // the provider's id of the calendar this page came from, one of those passed to pull; null when
  // there was nothing to pull
  calendarExternalId: string | null;
  // live events, plus cancelled instances of a series (cancelled set, carrying their master's id
  // and original start), which take an occurrence out of the master
  events: ExternalEvent[];
  // events and whole series the provider reports as cancelled or deleted
  cancelledIds: string[];
  nextCursor: SyncCursor;
  done: boolean;
  // items that failed to validate or map; left out of the page and counted in the run summary
  skipped: number;
}

export interface EventSource {
  // One page of one calendar per call, visiting `calendars` (the calendars to sync: those the user
  // selected that the account still lists, as the engine listed them at the start of the run) in
  // that order; done once every one has been walked to its end. The caller passes each page's
  // nextCursor to the next call, and commits the page with it, so a run cut short resumes at the
  // page it stopped on. A null or unreadable cursor starts every calendar with a full pass. Unlike
  // tasks there is no reconcile: the provider's feed reports deletions. GoogleEventSource has the
  // details.
  //
  // Stateless, like every adapter call: the calendars come in as an argument on every call, never
  // from an earlier one. See the note at the top of this file.
  pull(auth: Auth, cursor: SyncCursor | null, calendars: ExternalCalendar[]): Promise<EventPage>;
  // the calendars the account can read, with their name, colour and zone. The engine lists them at
  // the start of every run, and the calendar picker when it opens; a source's first listing selects
  // the one marked primary.
  listCalendars(auth: Auth): Promise<ExternalCalendar[]>;
}

export interface Provider {
  id: ProviderId;
  // the source types a connection gets, one external_sources row each
  supports: SourceType[];
  // how an account can be connected; connectWithApiKey refuses a provider without API_KEY. Includes
  // OAUTH exactly when `oauth` is set.
  authMethods: AuthType[];
  // declaring this is all a provider does to connect through OAuth; the flow lives in ../oauth
  oauth?: OAuthConfig;
  getAccount(auth: Auth): Promise<ExternalAccount>;
  tasks?: TaskSource;
  events?: EventSource;
}

// shared with the OAuth client, which may not import from providers/
export type { FetchFn } from '../fetch';
