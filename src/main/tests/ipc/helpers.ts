import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import type { AppEventName, AppEvents } from '@common/events';
import type { IpcResult } from '@common/ipc/types';
import { openDevBrain, type DevBrain, type WorkspaceOptions } from '@main/core';
import { openMemorySettingsStore } from '@main/core/tests/__mocks__/memory-settings-store';
import { WORKSPACE_OPTIONS } from '@main/core/tests/utils';
import type { Broadcaster } from '@main/ipc/broadcaster';
import { contextFactory } from '@main/ipc/context';
import { invokeHandler } from '../__mocks__/electron';

// What the IPC tests share: a context over a DevBrain, a broadcaster that keeps what it sent, and
// a DevBrain folder in a temporary directory.

export function testContext(devBrain: DevBrain | null = null) {
  return contextFactory({ devBrain, log: { debug: vi.fn(), warn: vi.fn() } });
}

// calls a procedure through the transport, as the renderer's link would
export function call<T = unknown>(
  path: string,
  input?: unknown,
  type: 'query' | 'mutation' = 'query',
): Promise<IpcResult<T>> {
  const event = {} as IpcMainInvokeEvent;
  return invokeHandler('ipc:call', event, { path, type, input }) as Promise<IpcResult<T>>;
}

export interface Sent<N extends AppEventName = AppEventName> {
  name: N;
  payload: AppEvents[N];
}

export function fakeBroadcaster(): Broadcaster & {
  sent: Sent[];
  named<N extends AppEventName>(name: N): AppEvents[N][];
} {
  const sent: Sent[] = [];
  return {
    sent,
    send(name, payload) {
      sent.push({ name, payload } as Sent);
    },
    named<N extends AppEventName>(name: N) {
      return sent
        .filter((event) => event.name === name)
        .map((event) => event.payload as AppEvents[N]);
    },
  };
}

// a new DevBrain folder in a temporary directory; `cleanup` closes it and removes the directory
export async function tempDevBrain(
  workspace: Partial<WorkspaceOptions> = {},
): Promise<{ devBrain: DevBrain; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-ipc-'));
  const devBrain = await openDevBrain({
    path: path.join(dir, 'brain'),
    settingsStore: openMemorySettingsStore,
    createIfMissing: true,
    workspace: { ...WORKSPACE_OPTIONS, ...workspace },
  });
  return {
    devBrain,
    cleanup: async () => {
      await devBrain.close();
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

// a new workspace in `devBrain`, closed, as the registry keeps it
export async function createWorkspace(devBrain: DevBrain, name: string) {
  const workspace = await devBrain.workspaces.create({ name, color: '#000000' });
  await workspace.close();
  return workspace.info.id;
}
