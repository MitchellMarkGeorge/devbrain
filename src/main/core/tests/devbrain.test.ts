import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { WorkspaceId } from '@common/ids';
import { MIGRATIONS_PATH } from './utils';
import { FakeCipher } from './__mocks__/fake-cipher';
import { createFakeProvider, FAKE_API_KEY, fakeRegistry, FakeProvider } from './sync/fake-provider';
import { scriptedFetch } from './integrations/linear/fake-fetch';
import viewerFixture from './integrations/fixtures/linear/viewer.json';
import page1Fixture from './integrations/fixtures/linear/assigned-issues-page-1.json';
import page2Fixture from './integrations/fixtures/linear/assigned-issues-page-2.json';
import { ExternalTask, LinkState, Provider } from '../integrations/types';
import { TaskPriority, TaskStatus } from '../tasks/types';
import { SyncProgress } from '../sync/types';

vi.mock('electron-store', () => import('./__mocks__/electron-store'));

import { DevBrain, openDevBrain } from '../index';
import { Workspace } from '../workspace/workspace';

// DevBrain as the main process runs it: one DevBrain over a folder, with the cipher, fetch and
// providers passed in, opening a workspace that syncs. Everything Electron is a fake here, and
// nothing under src/main/core imports it (see boundary.test.ts).

let tmpDir: string;
let devBrain: DevBrain;
let itemCount = 0;

function issue(overrides: Partial<ExternalTask> = {}): ExternalTask {
  itemCount += 1;
  return {
    externalId: `issue-${itemCount}`,
    key: `ENG-${itemCount}`,
    url: `https://linear.app/acme/issue/ENG-${itemCount}`,
    title: `Issue ${itemCount}`,
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
    ...overrides,
  };
}

// a DevBrain over a fresh folder whose workspaces sync through `provider`
async function devBrainWith(provider: FakeProvider): Promise<DevBrain> {
  return openDevBrain({
    path: path.join(tmpDir, 'brain'),
    createIfMissing: true,
    workspace: { cipher: new FakeCipher(), providers: fakeRegistry(provider) },
  });
}

// registers a workspace and closes it, as create leaves it open; returns its info
async function createWorkspace(name: string) {
  const created = await devBrain.workspaces.create({ name, color: '#000000' });
  await created.close();
  return created.info;
}

// Opens a workspace and lets its open pass run, which it defers to the next turn of the event loop.
// A connect after it starts exactly one run; one before it could be joined by the pass's own.
async function openWorkspace(id: WorkspaceId) {
  const workspace = await devBrain.workspaces.open(id);
  await new Promise((resolve) => setImmediate(resolve));
  return workspace;
}

// rows in the workspace's database, read through a second connection
function countRows(dbPath: string, table: string): number {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    return (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally {
    sqlite.close();
  }
}

beforeAll(() => {
  process.env.DB_MIGRATIONS_PATH = MIGRATIONS_PATH;
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-app-'));
});

afterEach(async () => {
  await devBrain?.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('DevBrain — connect, sync and close', () => {
  it('opens a workspace, connects Linear through fetch, syncs it and closes', async () => {
    const fetch = scriptedFetch([
      { body: viewerFixture },
      { body: page1Fixture },
      { body: page2Fixture },
    ]);
    devBrain = await openDevBrain({
      path: path.join(tmpDir, 'brain'),
      createIfMissing: true,
      workspace: { cipher: new FakeCipher(), fetch },
    });
    const { id } = await createWorkspace('Work');
    const workspace = await openWorkspace(id);
    const progress: SyncProgress[] = [];
    workspace.sync.onProgress((event) => progress.push(event));

    // connecting starts the first sync of its tasks source
    const integration = await workspace.integrations.connectWithApiKey(
      Provider.LINEAR,
      'lin_api_test',
    );
    await vi.waitFor(async () => {
      const [status] = await workspace.sync.getStatus();
      expect(status).toMatchObject({ running: false, lastError: null });
      expect(status.lastSyncedAt).not.toBeNull();
    });

    // both pages went through the fetch it was given, with the key from the cipher
    expect(fetch.requests).toHaveLength(3);
    expect(fetch.requests[1].headers.authorization).toBe('lin_api_test');
    expect(progress.map((event) => event.pages)).toEqual([1, 2]);
    const { items } = await workspace.tasks.listTasks();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((task) => task.external?.provider === Provider.LINEAR)).toBe(true);
    expect(items.every((task) => task.external?.state === LinkState.SYNCED)).toBe(true);

    await devBrain.close();
    expect(devBrain.currentWorkspace).toBeNull();

    // the synced rows and the connection outlive the close
    const reopened = await devBrain.workspaces.open(id);
    expect((await reopened.tasks.listTasks()).items).toHaveLength(items.length);
    expect((await reopened.integrations.list()).map((i) => i.id)).toEqual([integration.id]);
  });

  it('closing mid-sync waits for the run, and nothing is written after it resolves', async () => {
    const provider = createFakeProvider();
    devBrain = await devBrainWith(provider);
    const { id, path: workspacePath } = await createWorkspace('Work');
    const workspace = await openWorkspace(id);
    let pullStartedAt = 0;
    const pulled = new Promise<void>((resolve) =>
      provider.tasks.script({
        tasks: [issue()],
        delayMs: 200,
        onPull: () => {
          pullStartedAt = performance.now();
          resolve();
        },
      }),
    );
    await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    await pulled;

    await devBrain.close();
    // close waited for the pull to answer; the page was discarded, and no run is left to write it
    expect(performance.now() - pullStartedAt).toBeGreaterThanOrEqual(195);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(countRows(path.join(workspacePath, 'db.sqlite'), 'tasks')).toBe(0);
  });
});

describe('DevBrain — quitting during an open', () => {
  it('waits for the open, then closes it: nothing is open or syncing once close resolves', async () => {
    const provider = createFakeProvider();
    devBrain = await devBrainWith(provider);
    const { id } = await createWorkspace('Work');
    const connected = await openWorkspace(id);
    provider.tasks.script({ tasks: [issue()] });
    await connected.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    await vi.waitFor(async () => {
      const [status] = await connected.sync.getStatus();
      expect(status.lastSyncedAt).not.toBeNull();
    });
    await devBrain.close();
    const pulls = provider.tasks.pulls.length;

    // the next open has its database open, and waits here before it is made current
    const realOpen = Workspace.open.bind(Workspace);
    let opened!: Workspace;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => {
      vi.spyOn(Workspace, 'open').mockImplementationOnce(async (info, options) => {
        opened = await realOpen(info, options);
        resolve();
        await held;
        return opened;
      });
    });
    const opening = devBrain.workspaces.open(id);
    await reached;
    // the focus and resume triggers see no workspace while it opens
    expect(devBrain.currentWorkspace).toBeNull();

    const quitting = devBrain.close();
    release();
    await opening;
    await quitting;

    expect(devBrain.currentWorkspace).toBeNull();
    await expect(opened.tasks.listTasks()).rejects.toThrow();
    // the open pass would start on the next turn; a stopped scheduler pulls nothing
    await new Promise((resolve) => setImmediate(resolve));
    expect(provider.tasks.pulls).toHaveLength(pulls);
    vi.restoreAllMocks();
  });
});

describe('DevBrain — switching workspaces', () => {
  it("waits for the old workspace's runs to settle before the next one starts syncing", async () => {
    const provider = createFakeProvider();
    devBrain = await devBrainWith(provider);
    const first = await createWorkspace('First');
    const second = await createWorkspace('Second');

    const workspace = await openWorkspace(first.id);
    let pullStartedAt = 0;
    const pulled = new Promise<void>((resolve) =>
      provider.tasks.script({
        tasks: [issue()],
        delayMs: 200,
        onPull: () => {
          pullStartedAt = performance.now();
          resolve();
        },
      }),
    );
    await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    await pulled;

    const opened = await devBrain.workspaces.switch(second.id);

    // the switch resolved only once the first workspace's pull had answered and its run settled,
    // discarding the page
    expect(performance.now() - pullStartedAt).toBeGreaterThanOrEqual(195);
    expect(devBrain.currentWorkspace).toBe(opened);
    expect(countRows(path.join(first.path, 'db.sqlite'), 'tasks')).toBe(0);
    // the second workspace has no integration, so nothing else asked the provider for a page
    expect(provider.tasks.pulls).toHaveLength(1);
  });
});

describe('DevBrain — disconnect during a sync', () => {
  it('leaves no rows written by the run after disconnect resolves', async () => {
    const provider = createFakeProvider();
    devBrain = await devBrainWith(provider);
    const { id, path: workspacePath } = await createWorkspace('Work');
    const workspace = await openWorkspace(id);
    // the first page commits; the second answers after the disconnect has resolved
    const secondPull = new Promise<void>((resolve) =>
      provider.tasks.script(
        { tasks: [issue()], done: false },
        { tasks: [issue()], delayMs: 200, onPull: resolve },
      ),
    );
    const integration = await workspace.integrations.connectWithApiKey(
      Provider.LINEAR,
      FAKE_API_KEY,
    );
    await secondPull;
    expect((await workspace.tasks.listTasks()).items).toHaveLength(1);

    await workspace.integrations.disconnect(integration.id, { keepLocalCopies: false });
    const dbPath = path.join(workspacePath, 'db.sqlite');
    const afterDisconnect = ['tasks', 'external_links', 'external_sources', 'integrations'].map(
      (table) => countRows(dbPath, table),
    );
    expect(afterDisconnect).toEqual([0, 0, 0, 0]);

    // the second page arrives; the aborted run discards it and records nothing
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await workspace.sync.getStatus()).toEqual([]);
    expect(
      ['tasks', 'external_links', 'external_sources', 'integrations'].map((table) =>
        countRows(dbPath, table),
      ),
    ).toEqual([0, 0, 0, 0]);
    expect(provider.tasks.pending).toBe(0);
  });
});
