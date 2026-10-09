import { Auth } from '../../integrations/auth';
import {
  ExternalAccount,
  LookupOptions,
  LookupResult,
  Provider,
  SyncCursor,
  TaskPage,
  TaskSource,
} from '../../integrations/providers/provider';
import { ProviderRegistry } from '../../integrations/providers/registry';
import { linearTaskCursorSchema } from '../../integrations/schema';
import {
  AuthType,
  ExternalProject,
  ExternalTask,
  LinearTaskCursor,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import { IntegrationAuthError } from '../../shared/errors';
import { CURSOR_OVERLAP_MS } from '../../sync/constants';

// A task provider for engine tests. Each pull takes the next scripted step: a page, a failure, or
// either after a delay. It registers under Linear's id and hands out Linear-shaped cursors, so the
// engine's cursor validation applies to it: pages are numbered in `after`, and the last page of a
// walk returns an incremental cursor at the highest updatedAt seen across the walk minus the
// overlap, as the Linear provider does.

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
  cursor: SyncCursor | null;
}

export interface FakeLookup {
  externalIds: string[];
  projectIds: string[];
}

// answers one lookup; what it leaves out comes back empty
export type FakeLookupResponder = (request: FakeLookup) => Partial<LookupResult>;

export class FakeTaskSource implements TaskSource {
  readonly pulls: FakePull[] = [];
  readonly lookups: FakeLookup[] = [];
  // what listAssignedIds answers, or throws; unset, it throws
  assigned?: string[] | { error: unknown };
  // answers each lookup; unset, lookup throws
  respondToLookup?: FakeLookupResponder;
  private readonly steps: FakeStep[] = [];

  /** queues steps for the next pulls, in order */
  script(...steps: FakeStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  get pending(): number {
    return this.steps.length;
  }

  async pull(auth: Auth, cursor: SyncCursor | null): Promise<TaskPage> {
    this.pulls.push({ auth, cursor });
    const step = this.steps.shift();
    if (step === undefined) throw new Error('FakeTaskSource: no more steps');
    step.onPull?.();
    if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    if ('error' in step) throw step.error;

    const current = readCursor(cursor);
    const tasks = step.tasks ?? [];
    const done = step.done ?? true;
    const maxUpdatedAt = tasks.reduce<string | null>((max, task) => {
      const at = task.updatedAt.toISOString();
      return max === null || at > max ? at : max;
    }, current.maxUpdatedAt ?? null);

    return {
      tasks,
      projects: step.projects ?? [],
      removedIds: step.removedIds ?? [],
      skipped: step.skipped ?? 0,
      done,
      nextCursor: done
        ? nextIncremental(current, maxUpdatedAt)
        : nextPage(current, `page-${pageNumber(current) + 1}`, maxUpdatedAt),
    };
  }

  async listAssignedIds(): Promise<string[]> {
    if (this.assigned === undefined) {
      throw new Error('FakeTaskSource: listAssignedIds is not scripted');
    }
    if ('error' in this.assigned) throw this.assigned.error;
    return [...this.assigned];
  }

  async lookup(
    _auth: Auth,
    externalIds: string[],
    options: LookupOptions = {},
  ): Promise<LookupResult> {
    const request = { externalIds, projectIds: options.projectIds ?? [] };
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

function readCursor(cursor: SyncCursor | null): LinearTaskCursor {
  const parsed = linearTaskCursorSchema.safeParse(cursor);
  return parsed.success ? parsed.data : { mode: 'initial', after: null, maxUpdatedAt: null };
}

function pageNumber(cursor: LinearTaskCursor): number {
  return cursor.after ? Number(cursor.after.replace('page-', '')) : 0;
}

function nextPage(
  current: LinearTaskCursor,
  after: string,
  maxUpdatedAt: string | null,
): LinearTaskCursor {
  if (current.mode === 'initial') return { mode: 'initial', after, maxUpdatedAt };
  return {
    mode: 'incremental',
    updatedSince: current.updatedSince,
    after,
    ...(maxUpdatedAt !== null && { maxUpdatedAt }),
  };
}

function nextIncremental(current: LinearTaskCursor, maxUpdatedAt: string | null): LinearTaskCursor {
  if (maxUpdatedAt === null) {
    return current.mode === 'incremental'
      ? { mode: 'incremental', updatedSince: current.updatedSince }
      : { mode: 'incremental', updatedSince: new Date(0).toISOString() };
  }
  const since = new Date(new Date(maxUpdatedAt).getTime() - CURSOR_OVERLAP_MS).toISOString();
  return { mode: 'incremental', updatedSince: since };
}
