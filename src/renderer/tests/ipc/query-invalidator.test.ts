import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { EventClient } from '@renderer/ipc/events';
import {
  createQueryInvalidator,
  entitiesReadBy,
  type QueryInvalidator,
} from '@renderer/ipc/query-invalidator';

// What the renderer refetches when main says what changed, over a real QueryClient.

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;

let queryClient: QueryClient;
let fetches: Map<string, number>;
let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>;
let queryInvalidator: QueryInvalidator;
const unsubscribes: (() => void)[] = [];

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetches = new Map();
  onError = vi.fn<(error: unknown) => void>();
  queryInvalidator = createQueryInvalidator({ queryClient, onError });
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
    await queryClient.query(options).catch(() => {});
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

    await queryInvalidator.onChanged(['task']);

    expect(count('tasks.list')).toBe(2);
    expect(count('favorites.list')).toBe(2);
    expect(count('events.listForCalendar')).toBe(1);
    expect(count('app.version')).toBe(1);
  });

  it('refetches only the recents when an entity is viewed, and the recents when one is edited', async () => {
    await Promise.all(['tasks.list', 'recents.list'].map((path) => query(path)));

    await queryInvalidator.onChanged(['recent']);

    expect(count('recents.list')).toBe(2);
    expect(count('tasks.list')).toBe(1);

    await queryInvalidator.onChanged(['task']);

    expect(count('recents.list')).toBe(3);
  });

  it('refetches the settings when they change, and nothing else', async () => {
    await Promise.all(['settings.get', 'tasks.list'].map((path) => query(path)));

    await queryInvalidator.onChanged(['settings']);

    expect(count('settings.get')).toBe(2);
    expect(count('tasks.list')).toBe(1);
  });

  it('resolves once the refetches have landed', async () => {
    await query('tasks.list');

    await queryInvalidator.onChanged(['task']);

    expect(data('tasks.list')).toBe('tasks.list #2');
  });

  it('refetches a calendar view when a calendar is shown or hidden', async () => {
    await query('events.listForCalendar');

    await queryInvalidator.onChanged(['calendar']);

    expect(count('events.listForCalendar')).toBe(2);
  });

  it('marks an inactive query stale without fetching it', async () => {
    await query('notes.list', { active: false });

    await queryInvalidator.onChanged(['note']);

    expect(count('notes.list')).toBe(1);
    expect(queryClient.getQueryState(key('notes.list'))?.isInvalidated).toBe(true);
  });

  it('refetches a route it knows nothing about on every change', async () => {
    await query('newFeature.list');

    await queryInvalidator.onChanged(['integration']);

    expect(count('newFeature.list')).toBe(2);
  });

  it('does nothing for a call that changed nothing', async () => {
    await query('newFeature.list');

    await queryInvalidator.onChanged([]);

    expect(count('newFeature.list')).toBe(1);
  });
});

describe('the reads table', () => {
  it('lets a full path override its router', () => {
    expect(entitiesReadBy(['tasks', 'list'])).toEqual([
      'task',
      'project',
      'note',
      'event',
      'calendar',
    ]);
    // a note's content reads only the note, though the rest of its router reads more
    expect(entitiesReadBy(['notes', 'readContent'])).toEqual(['note']);
    expect(entitiesReadBy(['unknown', 'list'])).toBe('everything');
    expect(entitiesReadBy(['app', 'version'])).toEqual([]);
  });
});

describe('switching workspace', () => {
  it('drops what was cached for the old one without refetching it, refetches the workspace queries, and keeps the rest', async () => {
    await queryInvalidator.workspaceOpened(WORK);
    await query('tasks.list');
    await query('notes.list', { active: false });
    await query('settings.get');
    await query('workspaces.current');

    await queryInvalidator.workspaceOpened(HOME);

    // both are gone, even the one a page still shows: that page is the old workspace's, and the
    // next page's loaders fetch from the new one
    expect(data('tasks.list')).toBeUndefined();
    expect(count('tasks.list')).toBe(1);
    expect(data('notes.list')).toBeUndefined();
    expect(count('settings.get')).toBe(1);
    // which workspace is open changed, so the workspace queries refetch too
    expect(count('workspaces.current')).toBe(2);
  });

  it('keeps everything when the workspace said to be open already is', async () => {
    await queryInvalidator.workspaceOpened(WORK);
    await query('tasks.list');

    await queryInvalidator.workspaceOpened(WORK);

    expect(count('tasks.list')).toBe(1);
  });

  it('only refetches the workspace list for a call reporting workspace', async () => {
    await queryInvalidator.workspaceOpened(WORK);
    await query('tasks.list');
    await query('workspaces.list');

    // a workspace was created, or a switch whose workspace.changed resets the rest
    await queryInvalidator.onChanged(['workspace']);

    expect(count('workspaces.list')).toBe(2);
    expect(count('tasks.list')).toBe(1);
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

  it('refetches on db.changes and drops the workspace data on workspace.changed, until stopped', async () => {
    const events = fakeEvents();
    const stop = queryInvalidator.listen(events.client);
    await query('tasks.list');

    events.send('db.changes', { entities: ['task'] as ChangedEntity[] });
    await vi.waitFor(() => expect(count('tasks.list')).toBe(2));

    events.send('workspace.changed', { id: HOME, opening: null });
    await vi.waitFor(() => expect(data('tasks.list')).toBeUndefined());
    expect(count('tasks.list')).toBe(2);

    stop();
    expect(events.listeners.size).toBe(0);
  });

  it('refetches only what belongs to no workspace while one opens, and everything after', async () => {
    const events = fakeEvents();
    unsubscribes.push(queryInvalidator.listen(events.client));
    await queryInvalidator.workspaceOpened(WORK);
    await query('tasks.list');
    await query('sync.status');
    await query('workspaces.list');

    // a switch has started: main lets go of Work, whose sync runs settle with their last events
    events.send('workspace.changed', { id: WORK, opening: HOME });
    events.send('db.changes', { entities: ['task', 'workspace'] as ChangedEntity[] });
    events.send('sources.changed', { sourceId: 'src_1' as never });
    events.send('integrations.changed', {
      integrationId: 'int_1' as never,
      type: 'status_changed',
    });
    await vi.waitFor(() => expect(count('workspaces.list')).toBe(2));
    expect(count('tasks.list')).toBe(1);
    expect(count('sync.status')).toBe(1);

    // the switch failed with Work still open: its data refetches on events again
    events.send('workspace.changed', { id: WORK, opening: null });
    events.send('db.changes', { entities: ['task'] as ChangedEntity[] });
    await vi.waitFor(() => expect(count('tasks.list')).toBe(2));
  });

  it('refetches the sync status when a source or an account changes', async () => {
    const events = fakeEvents();
    unsubscribes.push(queryInvalidator.listen(events.client));
    await query('sync.status');
    await query('tasks.list');

    events.send('sources.changed', { sourceId: 'src_1' as never });
    await vi.waitFor(() => expect(count('sync.status')).toBe(2));
    events.send('integrations.changed', {
      integrationId: 'int_1' as never,
      type: 'status_changed',
    });
    await vi.waitFor(() => expect(count('sync.status')).toBe(3));
    expect(count('tasks.list')).toBe(1);
  });
});
