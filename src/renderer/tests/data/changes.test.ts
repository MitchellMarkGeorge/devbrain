import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { EventClient } from '../../ipc/events';
import { createChangeSync } from '../../data/changes';

// an event client whose events the test sends
function fakeEvents() {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const events: EventClient<AppEvents> = {
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as (payload: never) => void);
      return () => set.delete(listener as (payload: never) => void);
    },
  };
  function send<K extends keyof AppEvents>(name: K, payload: AppEvents[K]) {
    for (const listener of listeners.get(name) ?? [])
      (listener as (p: AppEvents[K]) => void)(payload);
  }
  return { events, send };
}

// a mutation that stays pending until `settle` is called
function pendingMutation(queryClient: QueryClient) {
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => (settle = resolve));
  const done = queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn: () => settled })
    .execute(undefined);
  return { settle, done };
}

let queryClient: QueryClient;
let invalidate: MockInstance<QueryClient['invalidateQueries']>;
let stop: () => void;
let send: ReturnType<typeof fakeEvents>['send'];
let applyChanges: (changed: ChangedEntity[]) => Promise<void>;

// the entities each invalidation was for, read back from its predicate
function flushed(): string[][] {
  return invalidate.mock.calls.map(([filters]) => {
    const routers = ['tasks', 'notes', 'events', 'calendars', 'integrations'];
    return routers.filter((router) =>
      filters?.predicate?.(
        queryClient
          .getQueryCache()
          .build(queryClient, { queryKey: [[router, 'list']] as readonly unknown[] }),
      ),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient();
  invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const sync = createChangeSync(queryClient);
  const fake = fakeEvents();
  send = fake.send;
  stop = sync.listen(fake.events);
  applyChanges = sync.applyChanges;
});

afterEach(() => {
  stop();
  queryClient.clear();
  vi.useRealTimers();
});

describe('db.changes', () => {
  it('flushes a burst once, 16 ms after the last change', () => {
    send('db.changes', { entities: ['task'] });
    vi.advanceTimersByTime(10);
    send('db.changes', { entities: ['note'] });
    vi.advanceTimersByTime(10);
    send('db.changes', { entities: ['task'] });
    vi.advanceTimersByTime(15);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(flushed()).toEqual([['tasks', 'notes']]);
    vi.advanceTimersByTime(1000);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('flushes a steady stream at least every 250 ms', () => {
    for (let ms = 0; ms < 600; ms += 10) {
      send('db.changes', { entities: ['task'] });
      vi.advanceTimersByTime(10);
    }

    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('ignores an event with no entities', () => {
    send('db.changes', { entities: [] });
    vi.advanceTimersByTime(1000);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('holds the flush while a mutation is pending, and flushes once it settles', async () => {
    const mutation = pendingMutation(queryClient);
    send('db.changes', { entities: ['event'] });
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();

    mutation.settle();
    await mutation.done;
    vi.advanceTimersByTime(16);

    expect(flushed()).toEqual([['events']]);
  });

  it('stops listening', () => {
    stop();
    send('db.changes', { entities: ['task'] });
    vi.advanceTimersByTime(1000);

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('applyChanges', () => {
  it('waits for the refetch when it is the only mutation in flight', async () => {
    let finishRefetch!: () => void;
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishRefetch = () => resolve('second'))),
      );
    const observer = new QueryObserver(queryClient, { queryKey: [['tasks', 'list'], {}], queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('first'));
    const mutation = pendingMutation(queryClient);

    let applied = false;
    const pending = applyChanges(['task']).then(() => (applied = true));
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    expect(applied).toBe(false);
    finishRefetch();
    await pending;

    expect(observer.getCurrentResult().data).toBe('second');
    mutation.settle();
    unsubscribe();
  });

  it('refetches what was held with its own changes', async () => {
    const mutation = pendingMutation(queryClient);
    send('db.changes', { entities: ['note'] });

    await applyChanges(['task']);

    expect(flushed()).toEqual([['tasks', 'notes']]);
    vi.advanceTimersByTime(1000);
    expect(invalidate).toHaveBeenCalledOnce();
    mutation.settle();
  });

  it('defers while other mutations are pending, until the last settles', async () => {
    const first = pendingMutation(queryClient);
    const second = pendingMutation(queryClient);

    await applyChanges(['task']);
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();

    first.settle();
    await first.done;
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();

    second.settle();
    await second.done;
    vi.advanceTimersByTime(16);
    expect(flushed()).toEqual([['tasks']]);
  });

  it('does nothing for a call that changed nothing, even with changes held', async () => {
    const mutation = pendingMutation(queryClient);
    send('db.changes', { entities: ['note'] });

    await applyChanges([]);

    expect(invalidate).not.toHaveBeenCalled();
    mutation.settle();
  });
});

describe('workspace.changed', () => {
  it('drops the cached data and what was held', () => {
    queryClient.setQueryData([['tasks', 'list'], {}], ['tsk_1']);
    send('db.changes', { entities: ['task'] });

    send('workspace.changed', { id: null });
    vi.advanceTimersByTime(1000);

    expect(queryClient.getQueryData([['tasks', 'list'], {}])).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
