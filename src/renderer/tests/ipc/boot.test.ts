import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import type { IpcBridge } from '@common/ipc/types';
import type { WorkspaceEntry } from '@main/core';
import { readBoot, seedQueryCache, type BootSnapshot } from '../../ipc/boot';
import { trpc } from '../../ipc';

// Reading main's boot snapshot as the page loads, and seeding the query cache with it.

const work = {
  id: 'wsp_work' as WorkspaceId,
  name: 'Work',
  color: '#3366ff',
} as WorkspaceEntry;

const snapshot: BootSnapshot = {
  devBrainAvailable: true,
  current: work,
  last: null,
  workspaces: { items: [work], nextCursor: null },
};

function bridgeWith(boot: IpcBridge['boot']): IpcBridge {
  return { invoke: vi.fn(), subscribe: vi.fn(), boot };
}

describe('readBoot', () => {
  it("returns main's snapshot", () => {
    expect(readBoot(bridgeWith(() => snapshot))).toBe(snapshot);
  });

  it('returns null when main sent none', () => {
    expect(readBoot(bridgeWith(() => null))).toBeNull();
    expect(readBoot(bridgeWith(() => undefined))).toBeNull();
  });

  it('returns null when the bridge throws', () => {
    expect(
      readBoot(
        bridgeWith(() => {
          throw new Error('no reply');
        }),
      ),
    ).toBeNull();
  });
});

describe('seedQueryCache', () => {
  it('fills workspaces.current and workspaces.list, and keeps them fresh', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, snapshot);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBe(work);
    expect(queryClient.getQueryData(trpc.workspaces.list.queryKey())).toBe(snapshot.workspaces);
    expect(queryClient.getQueryDefaults(trpc.workspaces.current.queryKey()).staleTime).toBe(
      Infinity,
    );
  });

  it('seeds nothing without a snapshot, so the queries fetch', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, null);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
