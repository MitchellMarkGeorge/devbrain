import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { WorkspaceId } from '@common/ids';
import type { IpcBridge } from '@common/ipc/types';
import type { AppSettings, WorkspaceInfo } from '@common/types';
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

const settings = { theme: 'dark' } as AppSettings;

const context: InitialLoadContext = {
  devBrainAvailable: true,
  workspace: { version: 3, state: { status: 'open', workspace: work, error: null } },
  workspaces: { items: [work], nextCursor: null },
  settings,
};

function bridgeWith(initialLoadContext: IpcBridge['initialLoadContext']): IpcBridge {
  return {
    invoke: vi.fn(),
    subscribe: vi.fn(),
    initialLoadContext,
    workspaceState: { get: () => null, subscribe: () => () => {} },
    platform: 'darwin',
  };
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
  it('fills workspaces.current, workspaces.list and the settings, and keeps them fresh', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, context);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBe(work);
    expect(queryClient.getQueryData(trpc.workspaces.list.queryKey())).toBe(context.workspaces);
    expect(queryClient.getQueryData(trpc.settings.get.queryKey())).toBe(settings);
    expect(queryClient.getQueryDefaults(trpc.workspaces.current.queryKey()).staleTime).toBe(
      Infinity,
    );
    expect(queryClient.getQueryDefaults(trpc.settings.get.queryKey()).staleTime).toBe(Infinity);
  });

  it('has no current workspace while one is opening or none is open', () => {
    for (const state of [
      { status: 'opening', workspace: work },
      { status: 'none', error: null },
    ] as const) {
      const queryClient = new QueryClient();
      seedQueryCache(queryClient, { ...context, workspace: { version: 1, state } });
      expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBeNull();
    }
  });

  it('seeds nothing without a context, so the queries fetch', () => {
    const queryClient = new QueryClient();
    seedQueryCache(queryClient, null);

    expect(queryClient.getQueryData(trpc.workspaces.current.queryKey())).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
