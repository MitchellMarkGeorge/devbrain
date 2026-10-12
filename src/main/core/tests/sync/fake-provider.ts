import { Auth } from '../../integrations/auth';
import {
  AssignedTaskPage,
  AssignedTasksQuery,
  ExternalAccount,
  Provider,
  Resolution,
  TaskResolution,
  TaskSource,
} from '../../integrations/providers/provider';
import { ProviderRegistry } from '../../integrations/providers/registry';
import {
  AuthType,
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

export function fakeRegistry(provider: Provider): ProviderRegistry {
  return new Map([[provider.id, provider]]);
}
