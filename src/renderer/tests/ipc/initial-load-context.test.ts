import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import type { IpcBridge } from '@common/ipc/types';
import type { WorkspaceInfo } from '@common/types';
import {
  readInitialLoadContext,
  seedQueryCache,
  type InitialLoadContext,
} from '../../ipc/initial-load-context';
import { trpc } from '../../ipc';

// Reading main's initial load context as the page loads, and seeding the query cache with it.

const work = {
  id: 'wsp_work' as WorkspaceId,
  name: 'Work',
  color: '#3366ff',
} as WorkspaceInfo;

const context: InitialLoadContext = {
  devBrainAvailable: true,
  current: work,
  workspaces: { items: [work], nextCursor: null },
  theme: 'system',
};

function bridgeWith(initialLoadContext: IpcBridge['initialLoadContext']): IpcBridge {
  return { invoke: vi.fn(), subscribe: vi.fn(), initialLoadContext, platform: 'darwin' };
}

describe('readInitialLoadContext', () => {
  it("returns main's context", () => {
    expect(readInitialLoadContext(bridgeWith(context))).toBe(context);
  });

  it('returns null when main sent none', () => {
    expect(readInitialLoadContext(bridgeWith(null))).toBeNull();
    expect(readInitialLoadContext(bridgeWith(undefined))).toBeNull();
  });

  it('returns null when there is no bridge', () => {
    expect(readInitialLoadContext()).toBeNull();
  });
});

describe('seedQueryCache', () => {
  it('fills workspaces.current and workspaces.list, and keeps them fresh', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, context);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBe(work);
    expect(queryClient.getQueryData(trpc.workspaces.list.queryKey())).toBe(context.workspaces);
    expect(queryClient.getQueryDefaults(trpc.workspaces.current.queryKey()).staleTime).toBe(
      Infinity,
    );
  });

  it('seeds nothing without a context, so the queries fetch', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, null);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
