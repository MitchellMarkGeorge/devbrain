import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcBridge } from '@common/ipc/types';
import type { BootSnapshot } from '@main/ipc/boot';
import { trpc } from '../../ipc';
import { readBootSnapshot, seedBootSnapshot } from '../../ipc/boot';

const snapshot: BootSnapshot = {
  devBrainAvailable: true,
  current: null,
  last: null,
  workspaces: { items: [], nextCursor: null },
};

describe('renderer boot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads through the preload bridge and tolerates its absence', () => {
    const bridge = { boot: vi.fn(() => snapshot) } as unknown as IpcBridge;
    vi.stubGlobal('window', { ipcBridge: bridge });
    expect(readBootSnapshot()).toBe(snapshot);
    expect(bridge.boot).toHaveBeenCalledOnce();

    vi.stubGlobal('window', {});
    expect(readBootSnapshot()).toBeNull();
  });

  it('seeds workspace queries without making them stale', () => {
    const client = new QueryClient();
    seedBootSnapshot(snapshot, client, trpc);

    const current = trpc.workspaces.current.queryOptions();
    const workspaces = trpc.workspaces.list.queryOptions();
    expect(client.getQueryData(current.queryKey)).toBeNull();
    expect(client.getQueryData(workspaces.queryKey)).toEqual(snapshot.workspaces);
    expect(client.getQueryDefaults(current.queryKey).staleTime).toBe(Infinity);
    expect(client.getQueryDefaults(workspaces.queryKey).staleTime).toBe(Infinity);
  });
});
