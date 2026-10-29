import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { EventClient } from '../../ipc/events';
import { createFreshness, readsOf, type Freshness } from '../../ipc/freshness';

// What the renderer refetches when main says what changed, over a real QueryClient.

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;

let queryClient: QueryClient;
let fetches: Map<string, number>;
let currentWorkspaceId: ReturnType<typeof vi.fn<() => Promise<WorkspaceId | null>>>;
let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>;
let freshness: Freshness;
const unsubscribes: (() => void)[] = [];

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetches = new Map();
  currentWorkspaceId = vi.fn(async () => WORK);
  onError = vi.fn<(error: unknown) => void>();
  freshness = createFreshness({ queryClient, currentWorkspaceId, onError });
});

afterEach(() => {
  unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
  queryClient.clear();
});

// a tRPC query key, as @trpc/tanstack-react-query builds it
const key = (path: string, input?: unknown): QueryKey => [
  path.split('.'),
  { ...(input === undefined ? {} : { input }), type: 'query' },
];

const count = (path: string) => fetches.get(path) ?? 0;

// a query a mounted component shows (active), or one only cached (inactive); resolves once loaded
async function query(
  path: string,
  { active = true, input }: { active?: boolean; input?: unknown } = {},
) {
  const options = {
    queryKey: key(path, input),
    queryFn: async () => {
      fetches.set(path, count(path) + 1);
      return `${path} #${count(path)}`;
    },
  };
  if (!active) {
    await queryClient.prefetchQuery(options);
    return;
  }
  const observer = new QueryObserver(queryClient, options);
  unsubscribes.push(observer.subscribe(() => {}));
  await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
}

function data(path: string) {
  return queryClient.getQueryData(key(path));
}

describe('onChanged', () => {
  it('refetches the active queries reading what changed, and only those', async () => {
    await Promise.all(
      ['tasks.list', 'favorites.list', 'events.listForCalendar', 'app.version'].map((path) =>
        query(path),
      ),
    );

    await freshness.onChanged(['task']);

    expect(count('tasks.list')).toBe(2);
    expect(count('favorites.list')).toBe(2);
    expect(count('events.listForCalendar')).toBe(1);
    expect(count('app.version')).toBe(1);
  });

  it('resolves once the refetches have landed', async () => {
    await query('tasks.list');

    await freshness.onChanged(['task']);

    expect(data('tasks.list')).toBe('tasks.list #2');
  });

  it('refetches a calendar view when a calendar is shown or hidden', async () => {
    await query('events.listForCalendar');

    await freshness.onChanged(['calendar']);

    expect(count('events.listForCalendar')).toBe(2);
  });

  it('marks an inactive query stale without fetching it', async () => {
    await query('notes.list', { active: false });

    await freshness.onChanged(['note']);

    expect(count('notes.list')).toBe(1);
    expect(queryClient.getQueryState(key('notes.list'))?.isInvalidated).toBe(true);
  });

  it('refetches a route it knows nothing about on every change', async () => {
    await query('newFeature.list');

    await freshness.onChanged(['integration']);

    expect(count('newFeature.list')).toBe(2);
  });

  it('does nothing for a call that changed nothing', async () => {
    await query('newFeature.list');

    await freshness.onChanged([]);

    expect(count('newFeature.list')).toBe(1);
  });
});

describe('the reads table', () => {
  it('lets a full path override its router', () => {
    expect(readsOf(['tasks', 'list'])).toEqual(['task', 'project']);
    expect(readsOf(['unknown', 'list'])).toBe('everything');
    expect(readsOf(['app', 'version'])).toEqual([]);
  });
});

describe('switching workspace', () => {
  it('drops what was cached for the old one, and keeps what belongs to none', async () => {
    await freshness.workspaceOpened(WORK);
    await query('tasks.list');
    await query('notes.list', { active: false });
    await query('settings.get');

    await freshness.workspaceOpened(HOME);

    // the active one loads again from the new workspace; the inactive one waits to be shown
    expect(data('tasks.list')).toBe('tasks.list #2');
    expect(data('notes.list')).toBeUndefined();
    expect(count('settings.get')).toBe(1);
  });

  it('keeps everything when the workspace said to be open already is', async () => {
    await freshness.workspaceOpened(WORK);
    await query('tasks.list');

    await freshness.workspaceOpened(WORK);

    expect(count('tasks.list')).toBe(1);
  });

  it('asks which is open when a call reports workspace, and resets only on a switch', async () => {
    await freshness.workspaceOpened(WORK);
    await query('tasks.list');
    await query('workspaces.list');

    // a workspace was created: the list changes, the open one does not
    await freshness.onChanged(['workspace']);
    expect(count('workspaces.list')).toBe(2);
    expect(count('tasks.list')).toBe(1);

    currentWorkspaceId.mockResolvedValue(HOME);
    await freshness.onChanged(['workspace']);
    expect(count('tasks.list')).toBe(2);
  });

  it('drops the workspace data when it cannot tell which is open', async () => {
    await freshness.workspaceOpened(WORK);
    await query('tasks.list');
    const failure = new Error('no answer');
    currentWorkspaceId.mockRejectedValue(failure);

    await freshness.onChanged(['workspace']);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(count('tasks.list')).toBe(2);
  });
});

describe('listen', () => {
  function fakeEvents() {
    const listeners = new Map<string, (payload: unknown) => void>();
    const client: EventClient<AppEvents> = {
      on(name, listener) {
        listeners.set(name, listener as (payload: unknown) => void);
        return () => listeners.delete(name);
      },
    };
    const send = <K extends keyof AppEvents>(name: K, payload: AppEvents[K]) =>
      listeners.get(name)?.(payload);
    return { client, send, listeners };
  }

  it('refetches on db.changes and resets on workspace.changed, until stopped', async () => {
    const events = fakeEvents();
    const stop = freshness.listen(events.client);
    await query('tasks.list');

    events.send('db.changes', { entities: ['task'] as ChangedEntity[] });
    await vi.waitFor(() => expect(count('tasks.list')).toBe(2));

    events.send('workspace.changed', { id: HOME });
    await vi.waitFor(() => expect(count('tasks.list')).toBe(3));

    stop();
    expect(events.listeners.size).toBe(0);
  });
});
