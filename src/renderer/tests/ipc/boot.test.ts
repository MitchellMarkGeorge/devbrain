import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { IpcBridge } from '@common/ipc/types';
import type { WorkspaceEntry } from '@main/core';
import { trpc } from '../../ipc';
import { readBoot, seedQueryCache, type BootSnapshot } from '../../ipc/boot';

const work = { id: 'wsp_work', name: 'Work', color: '#112233' } as WorkspaceEntry;

const snapshot: BootSnapshot = {
  devBrainAvailable: true,
  current: work,
  last: null,
  workspaces: { items: [work], nextCursor: null },
};

const bridgeAnswering = (boot: IpcBridge['boot']): IpcBridge => ({
  invoke: vi.fn(),
  subscribe: vi.fn(),
  boot,
});

describe('readBoot', () => {
  it("is main's snapshot", () => {
    expect(readBoot(bridgeAnswering(() => snapshot))).toBe(snapshot);
  });

  it('is null when main sent none, or the bridge fails', () => {
    expect(readBoot(bridgeAnswering(() => null))).toBeNull();
    expect(
      readBoot(
        bridgeAnswering(() => {
          throw new Error('no main');
        }),
      ),
    ).toBeNull();
  });
});

describe('seedQueryCache', () => {
  it('puts the open workspace and the list in the cache, fresh until main says otherwise', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, snapshot);

    const currentKey = trpc.workspaces.current.queryKey();
    const listKey = trpc.workspaces.list.queryKey();
    expect(queryClient.getQueryData(currentKey)).toBe(work);
    expect(queryClient.getQueryData(listKey)).toEqual(snapshot.workspaces);
    expect(queryClient.getQueryDefaults(currentKey).staleTime).toBe(Infinity);
    expect(queryClient.getQueryDefaults(listKey).staleTime).toBe(Infinity);
    // what the page renders matches what was seeded: the queries' own options use the same keys
    expect(trpc.workspaces.current.queryOptions().queryKey).toEqual(currentKey);
    expect(trpc.workspaces.list.queryOptions().queryKey).toEqual(listKey);
  });

  it('seeds nothing without a snapshot, so the page fetches', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, null);
    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBeUndefined();
  });
});
