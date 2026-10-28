// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { AppEvents } from '@common/events';
import type { IpcBridge, IpcRequest, IpcResult } from '@common/ipc/types';
import { createChangeSync } from '../../data/changes';
import { createEventClient } from '../../ipc/events';
import { ipcLink } from '../../ipc/link';

// a router to call through; only its type is used, the fake bridge answers
const t = initTRPC.create();
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
const testRouter = t.router({
  tasks: t.router({
    get: t.procedure.input(z.object({ id: z.string() })).query(() => ({ title: '' })),
    rename: t.procedure.input(z.object({ id: z.string(), title: z.string() })).mutation(() => null),
  }),
  notes: t.router({
    get: t.procedure.input(z.object({ id: z.string() })).query(() => ({ title: '' })),
  }),
});

// main, faked: a task and a note, a rename that reports `changed: ['task']`, and push events
function fakeMain() {
  const titles: Record<string, string> = { tsk_1: 'Draft', nte_1: 'Notes' };
  const listeners = new Map<string, (payload: unknown) => void>();
  const bridge = {
    invoke: vi.fn<IpcBridge['invoke']>(
      async ({ path, input }: IpcRequest): Promise<IpcResult<unknown>> => {
        const { id, title } = input as { id: string; title?: string };
        if (path === 'tasks.rename') {
          titles[id] = title!;
          return { ok: true, data: null, changed: ['task'] };
        }
        return { ok: true, data: { title: titles[id] }, changed: [] };
      },
    ),
    subscribe: vi.fn<IpcBridge['subscribe']>((name, listener) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    }),
  };
  function broadcast<K extends keyof AppEvents>(name: K, payload: AppEvents[K]) {
    act(() => listeners.get(name)?.(payload));
  }
  // the procedures called, in order
  const calls = () => bridge.invoke.mock.calls.map(([request]) => request.path);
  return { bridge, titles, broadcast, calls };
}

// the app's setup, over the fake main
function setup() {
  const main = fakeMain();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const changeSync = createChangeSync(queryClient);
  const client = createTRPCClient<typeof testRouter>({
    links: [ipcLink({ bridge: main.bridge, onChanged: changeSync.applyChanges })],
  });
  const trpc = createTRPCOptionsProxy<typeof testRouter>({ client, queryClient });
  const stop = changeSync.listen(createEventClient<AppEvents>({ bridge: main.bridge }));

  let renamed: Promise<unknown> | undefined;
  function Views() {
    const task = useQuery(trpc.tasks.get.queryOptions({ id: 'tsk_1' }));
    const note = useQuery(trpc.notes.get.queryOptions({ id: 'nte_1' }));
    const rename = useMutation(trpc.tasks.rename.mutationOptions());
    return (
      <div>
        <p>task: {task.data?.title ?? 'loading'}</p>
        <p>note: {note.data?.title ?? 'loading'}</p>
        <button onClick={() => (renamed = rename.mutateAsync({ id: 'tsk_1', title: 'Final' }))}>
          rename
        </button>
      </div>
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Views />
    </QueryClientProvider>,
  );
  return { ...main, queryClient, stop, renamed: () => renamed };
}

afterEach(cleanup);

describe("tRPC's React Query integration over ipcLink", () => {
  it('runs a query, keyed by its path, and a mutation', async () => {
    const { queryClient, bridge, stop } = setup();

    expect(await screen.findByText('task: Draft')).toBeTruthy();
    expect(
      queryClient.getQueryCache().findAll({ queryKey: [['tasks', 'get']] })[0].queryKey,
    ).toEqual([['tasks', 'get'], { input: { id: 'tsk_1' }, type: 'query' }]);

    act(() => screen.getByText('rename').click());
    await waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith({
        path: 'tasks.rename',
        type: 'mutation',
        input: { id: 'tsk_1', title: 'Final' },
      }),
    );
    stop();
  });
});

describe('invalidation through React Query', () => {
  it("refetches a mutation's changes before it resolves, and only the affected queries", async () => {
    const { calls, renamed, stop } = setup();
    await screen.findByText('task: Draft');
    await screen.findByText('note: Notes');
    const before = calls().length;

    act(() => screen.getByText('rename').click());
    await act(async () => {
      await waitFor(() => expect(renamed()).toBeDefined());
      await renamed();
    });

    // the refetch came back before the mutation resolved
    expect(calls().slice(before)).toEqual(['tasks.rename', 'tasks.get']);
    expect(screen.getByText('task: Final')).toBeTruthy();
    stop();
  });

  it('refetches the affected queries on a db.changes broadcast', async () => {
    const { titles, broadcast, calls, stop } = setup();
    await screen.findByText('task: Draft');
    await screen.findByText('note: Notes');
    const before = calls().length;

    titles.nte_1 = 'Synced';
    broadcast('db.changes', { entities: ['note'] });

    expect(await screen.findByText('note: Synced')).toBeTruthy();
    expect(calls().slice(before)).toEqual(['notes.get']);
    stop();
  });

  it('refetches the mounted queries when the workspace changes', async () => {
    const { titles, broadcast, stop } = setup();
    await screen.findByText('task: Draft');

    titles.tsk_1 = 'Other workspace';
    broadcast('workspace.changed', { id: null });

    expect(await screen.findByText('task: Other workspace')).toBeTruthy();
    stop();
  });
});
