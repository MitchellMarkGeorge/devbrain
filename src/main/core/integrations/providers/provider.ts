import {
  AuthType,
  ExternalCalendar,
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  Provider as ProviderId,
  SourceType,
} from '../types';
import { Auth } from '../auth';
import { OAuthConfig } from '../oauth/types';
import { CoreError } from '../../shared/errors';

// The provider contract: each provider in DevBrain's terms. Implementations are looked up through
// the registry in ./registry.
//
// Three layers make up a provider:
// - its client (LinearClient, GoogleCalendarClient): HTTP, auth headers, rate limits, errors and
//   response schemas
// - its sources (TaskSource, CalendarSource): queries in, normalised items out. A source knows
//   nothing of sync: no cursors, no modes, no run state, and it never touches the database. So a
//   source can serve anything that needs the provider, not only sync
// - the syncers in ../../sync, which keep DevBrain's copy current: cursors, modes, windows,
//   reconcile and calendar selection, built on these calls
//
// Sources are also stateless. The registry holds one instance of each provider for the whole app,
// shared by every account connected to it and by calls that may interleave, so a call must work
// only from its arguments and keep nothing between calls: no cache, no per-account field.

// who a credential belongs to, from the provider's own account query
export interface ExternalAccount {
  // unique per provider; stored in integrations.accountId
  accountId: string;
  // shown in settings, e.g. "Ada Lovelace, Acme"
  label: string;
  // the provider's id for the user, used to tell whether an item is assigned to them
  userId: string;
}

// what to ask for in one page of the viewer's assigned tasks; at most one of the two filters
export interface AssignedTasksQuery {
  // only tasks changed after this (an edit, or archiving, which some providers do on trashing)
  changedSince?: string;
  // open tasks, plus those closed after this
  closedSince?: string;
  // from the previous page's nextPageToken; absent for the first page
  pageToken?: string;
}

export interface AssignedTaskPage {
  // the page's tasks, trashed ones left out
  tasks: ExternalTask[];
  // the page's tasks' projects, each once
  projects: ExternalProject[];
  // tasks on the page that the provider reports as trashed
  trashedIds: string[];
  // items that failed to validate or map; left out of the page
  skipped: number;
  // the latest change on the page, as an ISO string: the later of each task's updatedAt and its
  // archivedAt, as archiving counts; null for a page with nothing readable
  latestChange: string | null;
  // the token for the next page; null on the last
  nextPageToken: string | null;
}

// ids sorted into what they resolve to
export interface Resolution<T> {
  // valid and not trashed
  found: T[];
  // missing, or trashed
  gone: string[];
  // came back but failed to validate: never reported as gone, so a schema mismatch on our side
  // cannot make an item look deleted
  skipped: number;
}

export interface TaskResolution extends Resolution<ExternalTask> {
  // the found tasks' projects, each once
  projects: ExternalProject[];
}

// what a sync passes to each source call
export interface RequestOptions {
  // aborts the call's requests; an aborted call rejects with the signal's reason
  signal?: AbortSignal;
}

export interface TaskSource {
  // One page of the viewer's assigned tasks matching the query, in the order they last changed.
  // A provider that lets the user choose what to sync (Linear teams, GitHub repositories) would
  // take that choice as part of the query.
  getAssignedTaskPage(
    auth: Auth,
    query: AssignedTasksQuery,
    options?: RequestOptions,
  ): Promise<AssignedTaskPage>;
  // ids of the viewer's open assigned tasks, across every page
  listOpenAssignedTaskIds(auth: Auth, options?: RequestOptions): Promise<string[]>;
  // each id sorted into found, gone (missing or trashed) or unreadable, plus the found tasks'
  // projects. A found task with assignedToViewer false has been reassigned. Empty input makes no
  // request.
  resolveTasks(auth: Auth, ids: string[], options?: RequestOptions): Promise<TaskResolution>;
  // the same for projects. An archived project that is not trashed still exists, so it is found.
  // Empty input makes no request.
  resolveProjects(
    auth: Auth,
    ids: string[],
    options?: RequestOptions,
  ): Promise<Resolution<ExternalProject>>;
}

// a calendar's change token is no longer accepted (nor, with it, a page token of its pass): the
// calendar must be walked again from the start
export class ChangeTokenExpiredError extends CoreError {
  readonly code = 'change_token_expired';
  constructor() {
    super('Calendar change token expired');
    this.name = 'ChangeTokenExpiredError';
  }
}

// one page of a calendar's events: everything from `from` on (a full pass), or the changes since
// `changeToken`, which the last page of an earlier pass handed out
export type EventsQuery = ({ from: string } | { changeToken: string }) & { pageToken?: string };

export interface CalendarEventPage {
  // live events, plus cancelled instances of a series (cancelled set, carrying their master's id
  // and original start), which take an occurrence out of the master. An event's timeZone is its
  // own, else the calendar's as the page gives it; null when neither says
  events: ExternalEvent[];
  // events and whole series the provider reports as cancelled or deleted
  cancelledIds: string[];
  // items that failed to validate or map; left out of the page
  skipped: number;
  // the token for the next page of this pass; null on the last
  nextPageToken: string | null;
  // set on the last page of a pass only: the token to ask for the changes after it
  changeToken: string | null;
}

export interface CalendarSource {
  // The calendars the account can read, as the provider has them now, with the provider's id,
  // name, colour, zone and whether it is the account's primary calendar.
  listCalendars(auth: Auth, options?: RequestOptions): Promise<ExternalCalendar[]>;
  // One page of a calendar's events. Throws ChangeTokenExpiredError when the change token (or the
  // page token) is no longer accepted.
  getEventPage(
    auth: Auth,
    calendarId: string,
    query: EventsQuery,
    options?: RequestOptions,
  ): Promise<CalendarEventPage>;
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
  calendars?: CalendarSource;
}

// shared with the OAuth client, which may not import from providers/
export type { FetchFn } from '../fetch';
