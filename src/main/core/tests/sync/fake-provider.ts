import { Auth } from '../../integrations/auth';
import {
  AssignedTaskPage,
  AssignedTasksQuery,
  CalendarEventPage,
  CalendarSource,
  EventsQuery,
  ExternalAccount,
  Provider,
  Resolution,
  TaskResolution,
  TaskSource,
} from '../../integrations/providers/provider';
import { ProviderRegistry } from '../../integrations/providers/registry';
import {
  AuthType,
  ExternalCalendar,
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import { IntegrationAuthError } from '../../shared/errors';

// A task provider for engine tests. Each page request takes the next scripted step: a page, a
// failure, or either after a delay. It registers under Linear's id. Pages are numbered in their
// page tokens (page-1, page-2, ...), each page's latestChange is its tasks' highest updatedAt, and
// a step that is not done hands out the next page's token, as a provider's source does; the
// cursor is TaskSyncer's.

export const FAKE_API_KEY = 'fake_api_key';
export const FAKE_ACCOUNT: ExternalAccount = {
  accountId: 'org-1:user-1',
  label: 'Ada Lovelace, Acme',
  userId: 'user-1',
};

export interface FakePage {
  tasks?: ExternalTask[];
  projects?: ExternalProject[];
  removedIds?: string[];
  skipped?: number;
  // whether this is the walk's last page; defaults to true
  done?: boolean;
}

export type FakeStep = (FakePage | { error: unknown }) & {
  // waits this long before answering
  delayMs?: number;
  // runs when the pull starts, before any delay; e.g. to abort the run mid-page
  onPull?: () => void;
};

export interface FakePull {
  auth: Auth;
  query: AssignedTasksQuery;
}

// one resolveTasks call (externalIds) or resolveProjects call (projectIds); the other list is empty
export interface FakeLookup {
  externalIds: string[];
  projectIds: string[];
}

// what a lookup resolves to, as both calls together would: the found tasks and their projects,
// the found requested projects, and what is gone
export interface FakeLookupResult {
  tasks: ExternalTask[];
  projects: ExternalProject[];
  gone: string[];
  goneProjects: string[];
  skipped: number;
}

// answers one lookup; what it leaves out comes back empty
export type FakeLookupResponder = (request: FakeLookup) => Partial<FakeLookupResult>;

export class FakeTaskSource implements TaskSource {
  readonly pulls: FakePull[] = [];
  readonly lookups: FakeLookup[] = [];
  // what listOpenAssignedTaskIds answers, or throws; unset, it throws
  assigned?: string[] | { error: unknown };
  // answers each lookup; unset, a lookup throws
  respondToLookup?: FakeLookupResponder;
  private readonly steps: FakeStep[] = [];

  /** queues steps for the next page requests, in order */
  script(...steps: FakeStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  get pending(): number {
    return this.steps.length;
  }

  async getAssignedTaskPage(auth: Auth, query: AssignedTasksQuery): Promise<AssignedTaskPage> {
    this.pulls.push({ auth, query });
    const step = this.steps.shift();
    if (step === undefined) throw new Error('FakeTaskSource: no more steps');
    step.onPull?.();
    if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    if ('error' in step) throw step.error;

    const tasks = step.tasks ?? [];
    const latestChange = tasks.reduce<string | null>((max, task) => {
      const at = task.updatedAt.toISOString();
      return max === null || at > max ? at : max;
    }, null);
    const pageNumber = query.pageToken ? Number(query.pageToken.replace('page-', '')) : 0;

    return {
      tasks,
      projects: step.projects ?? [],
      trashedIds: step.removedIds ?? [],
      skipped: step.skipped ?? 0,
      latestChange,
      nextPageToken: (step.done ?? true) ? null : `page-${pageNumber + 1}`,
    };
  }

  async listOpenAssignedTaskIds(): Promise<string[]> {
    if (this.assigned === undefined) {
      throw new Error('FakeTaskSource: listOpenAssignedTaskIds is not scripted');
    }
    if ('error' in this.assigned) throw this.assigned.error;
    return [...this.assigned];
  }

  async resolveTasks(_auth: Auth, ids: string[]): Promise<TaskResolution> {
    const result = this.lookup({ externalIds: ids, projectIds: [] });
    return {
      found: result.tasks,
      projects: result.projects,
      gone: result.gone,
      skipped: result.skipped,
    };
  }

  async resolveProjects(_auth: Auth, ids: string[]): Promise<Resolution<ExternalProject>> {
    const result = this.lookup({ externalIds: [], projectIds: ids });
    return { found: result.projects, gone: result.goneProjects, skipped: result.skipped };
  }

  private lookup(request: FakeLookup): FakeLookupResult {
    this.lookups.push(request);
    if (!this.respondToLookup) throw new Error('FakeTaskSource: lookup is not scripted');
    return {
      tasks: [],
      projects: [],
      gone: [],
      goneProjects: [],
      skipped: 0,
      ...this.respondToLookup(request),
    };
  }
}

export interface FakeProvider extends Provider {
  tasks: FakeTaskSource;
}

// accepts FAKE_API_KEY only, so connectWithApiKey works as it does with Linear
export function createFakeProvider(): FakeProvider {
  return {
    id: ProviderId.LINEAR,
    supports: [SourceType.TASKS],
    authMethods: [AuthType.API_KEY],
    async getAccount(auth) {
      if (auth.authorization !== FAKE_API_KEY) throw new IntegrationAuthError('rejected');
      return FAKE_ACCOUNT;
    },
    tasks: new FakeTaskSource(),
  };
}

export function fakeRegistry(...providers: Provider[]): ProviderRegistry {
  return new Map(providers.map((provider) => [provider.id, provider]));
}

export const FAKE_ACCESS_TOKEN = 'fake_access_token';
export const FAKE_REFRESH_TOKEN = 'fake_refresh_token';
export const FAKE_CALENDAR_ACCOUNT: ExternalAccount = {
  accountId: 'subject-1',
  label: 'ada@example.com',
  userId: 'subject-1',
};

// A calendar source for engine tests: it lists `calendars`, and every page request for a calendar
// answers with all of its `events` as one last page, full pass or not.
export class FakeCalendarSource implements CalendarSource {
  calendars: ExternalCalendar[] = [
    { id: 'ada@example.com', name: 'Ada', primary: true, color: '#039be5', timeZone: 'UTC' },
  ];
  readonly events = new Map<string, ExternalEvent[]>();
  readonly pulls: { calendarId: string; query: EventsQuery }[] = [];

  async listCalendars(): Promise<ExternalCalendar[]> {
    return [...this.calendars];
  }

  async getEventPage(
    _auth: Auth,
    calendarId: string,
    query: EventsQuery,
  ): Promise<CalendarEventPage> {
    this.pulls.push({ calendarId, query });
    return {
      events: this.events.get(calendarId) ?? [],
      cancelledIds: [],
      skipped: 0,
      skippedIds: [],
      nextPageToken: null,
      changeToken: `change-${this.pulls.length}`,
    };
  }
}

export interface FakeCalendarProvider extends Provider {
  calendars: FakeCalendarSource;
}

// An events provider connected through OAuth, registered under Google Calendar's id. Its account
// query accepts FAKE_ACCESS_TOKEN only; pair it with an OAuthClient that hands that token out.
export function createFakeCalendarProvider(): FakeCalendarProvider {
  return {
    id: ProviderId.GOOGLE_CALENDAR,
    supports: [SourceType.EVENTS],
    authMethods: [AuthType.OAUTH],
    oauth: {
      authorizeUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      revokeUrl: 'https://auth.example.com/revoke',
      clientId: 'fake-client',
      scopes: ['calendar'],
      redirect: { ports: 'any', path: '/callback' },
    },
    async getAccount(auth) {
      if (auth.authorization !== `Bearer ${FAKE_ACCESS_TOKEN}`) {
        throw new IntegrationAuthError('rejected');
      }
      return FAKE_CALENDAR_ACCOUNT;
    },
    calendars: new FakeCalendarSource(),
  };
}
