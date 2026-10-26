import { deferred } from '../utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '../../workspace/types';
import {
  NotFoundError,
  WorkspaceDataMissingError,
  WorkspaceNotOpenError,
} from '../../shared/errors';
import { FakeCipher } from '../__mocks__/fake-cipher';

// Mock the Workspace class so WorkspaceService tests don't need SQLite
vi.mock('../../workspace/workspace', () => ({
  Workspace: {
    create: vi.fn(),
    open: vi.fn(),
  },
}));

import { WorkspaceService } from '../../workspace/service';
import { Workspace } from '../../workspace/workspace';

const makeInfo = (overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo => ({
  id: 'wsp_test001' as WorkspaceId,
  name: 'Test Workspace',
  color: '#000000',
  path: '/fake/workspaces/wsp_test001',
  createdAt: Date.now(),
  lastOpenedAt: null,
  ...overrides,
});

// an IntegrationService with these integrations, recording each disconnect in `calls`
const fakeIntegrations = (ids: string[], calls: string[] = []) => ({
  list: vi.fn(async () => ids.map((id) => ({ id }))),
  disconnect: vi.fn(async (id: string) => void calls.push(`disconnect ${id}`)),
});

const makeRegistry = (infos: WorkspaceInfo[]): Record<WorkspaceId, WorkspaceInfo> =>
  Object.fromEntries(infos.map((w) => [w.id, w])) as Record<WorkspaceId, WorkspaceInfo>;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-wssvc-'));
  vi.resetAllMocks();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

const writeRegistry = (dir: string, infos: WorkspaceInfo[]) => {
  fsSync.writeFileSync(
    path.join(dir, 'workspaces.json'),
    JSON.stringify(makeRegistry(infos), null, 2),
    'utf8',
  );
};

// Establish state through the public lifecycle API rather than mutating currentWorkspace.
async function setOpenWorkspace(service: WorkspaceService, workspace: { info: WorkspaceInfo }) {
  const info = service.listAll().items.find((item) => item.id === workspace.info.id) ?? {
    ...workspace.info,
    path: path.join(tmpDir, 'fixtures', workspace.info.id),
  };
  await fs.mkdir(info.path, { recursive: true });
  const registry = makeRegistry(service.listAll().items);
  registry[info.id] ??= info;
  writeRegistry(tmpDir, Object.values(registry));
  if (!('sync' in workspace)) Object.assign(workspace, { sync: { start: vi.fn() } });
  vi.mocked(Workspace.open).mockResolvedValueOnce(workspace as never);
  await service.open(info.id);
}

describe('WorkspaceService — registry reads', () => {
  it('listAll() returns empty array when workspaces.json is absent', () => {
    const service = new WorkspaceService(tmpDir);
    expect(service.listAll().items).toEqual([]);
  });

  it('listAll() returns all workspace infos', () => {
    const infos = [makeInfo(), makeInfo({ id: 'wsp_test002' as WorkspaceId, name: 'Second' })];
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir);
    expect(service.listAll().items).toHaveLength(2);
  });

  it('getById() returns matching workspace info', () => {
    const info = makeInfo();
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getById(info.id)).toMatchObject({ id: info.id, name: info.name });
  });

  it('getById() throws NotFoundError for unknown id', () => {
    writeRegistry(tmpDir, [makeInfo()]);
    const service = new WorkspaceService(tmpDir);
    expect(() => service.getById('wsp_unknown' as WorkspaceId)).toThrow(NotFoundError);
  });

  it('getByName() returns matching workspace info', () => {
    const info = makeInfo({ name: 'Unique Name' });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getByName('Unique Name')).toMatchObject({ id: info.id });
  });

  it('getByName() returns null for unknown name', () => {
    writeRegistry(tmpDir, [makeInfo()]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getByName('Unknown')).toBeNull();
  });

  it('getByName() is case-sensitive', () => {
    const info = makeInfo({ name: 'MyWorkspace' });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getByName('myworkspace')).toBeNull();
    expect(service.getByName('MYWORKSPACE')).toBeNull();
    expect(service.getByName('MyWorkspace')).not.toBeNull();
  });
});

describe('WorkspaceService — create', () => {
  it('adds a new entry to workspaces.json', async () => {
    writeRegistry(tmpDir, []);
    const workspacesDir = path.join(tmpDir, 'workspaces');
    await fs.mkdir(workspacesDir);

    const fakeWorkspace = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'New WS', color: '#ff0000' });

    expect(service.listAll().items).toHaveLength(1);
    expect(service.listAll().items[0].name).toBe('New WS');
  });

  it('persists the workspace color', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const fakeWorkspace = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'Coloured', color: '#aabbcc' });

    expect(service.listAll().items[0].color).toBe('#aabbcc');
  });

  it('creates unique ids for multiple workspaces', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    vi.mocked(Workspace.create).mockResolvedValue({
      info: makeInfo(),
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'WS 1', color: '#000000' });
    await service.create({ name: 'WS 2', color: '#000000' });

    const all = service.listAll().items;
    expect(all).toHaveLength(2);
    expect(all[0].id).not.toBe(all[1].id);
  });

  it('calls Workspace.create with the generated workspace info', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const fakeWorkspace = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'Check Args', color: '#000' });

    expect(Workspace.create).toHaveBeenCalledOnce();
    const calledInfo = vi.mocked(Workspace.create).mock.calls[0][0];
    expect(calledInfo.name).toBe('Check Args');
    expect(calledInfo.id).toMatch(/^wsp_/);
  });

  it('sets createdAt to a recent timestamp', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const before = Date.now();
    vi.mocked(Workspace.create).mockResolvedValue({
      info: makeInfo(),
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'Timestamp', color: '#000000' });
    const after = Date.now();

    const created = service.listAll().items[0];
    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.createdAt).toBeLessThanOrEqual(after);
  });

  it('new workspace has lastOpenedAt as null', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    vi.mocked(Workspace.create).mockResolvedValue({
      info: makeInfo(),
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'New', color: '#000000' });

    expect(service.listAll().items[0].lastOpenedAt).toBeNull();
  });
});

describe('WorkspaceService — delete', () => {
  // a service whose open workspace is `info`, as WorkspaceService.open leaves it
  async function openService(info: WorkspaceInfo, integrations = fakeIntegrations([])) {
    const workspace = { info, close: vi.fn(), integrations };
    const service = new WorkspaceService(tmpDir);
    await setOpenWorkspace(service, workspace);
    return { service, workspace };
  }

  it('removes the workspace from the registry', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const { service } = await openService(info);
    await service.delete(info.id);

    expect(service.listAll().items).toHaveLength(0);
  });

  it('removes the workspace directory from the filesystem', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const { service } = await openService(info);
    await service.delete(info.id);

    await expect(fs.stat(info.path)).rejects.toThrow();
  });

  it('throws when no matching workspace exists in registry', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir);
    await expect(service.delete('wsp_missing' as WorkspaceId)).rejects.toThrow(NotFoundError);
  });

  it('throws WorkspaceDataMissingError when the workspace directory is gone', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);

    const { service } = await openService(info);
    await fs.rm(info.path, { recursive: true });
    await expect(service.delete(info.id)).rejects.toMatchObject({
      code: 'workspace_data_missing',
      workspaceId: info.id,
    });
    expect(service.listAll().items).toHaveLength(1);
  });

  it('refuses a workspace that is not open, changing nothing', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    const other = makeInfo({
      id: 'wsp_other' as WorkspaceId,
      path: path.join(tmpDir, 'workspaces', 'wsp_other'),
    });
    writeRegistry(tmpDir, [info, other]);
    await fs.mkdir(info.path, { recursive: true });

    // nothing open, then another workspace open
    await expect(new WorkspaceService(tmpDir).delete(info.id)).rejects.toThrow(
      WorkspaceNotOpenError,
    );
    const { service, workspace } = await openService(other);
    await expect(service.delete(info.id)).rejects.toThrow(WorkspaceNotOpenError);

    expect(Workspace.open).toHaveBeenCalledOnce();
    expect(workspace.integrations.disconnect).not.toHaveBeenCalled();
    expect(workspace.close).not.toHaveBeenCalled();
    expect(service.currentWorkspace).toBe(workspace);
    expect(service.listAll().items).toHaveLength(2);
    await expect(fs.stat(info.path)).resolves.toBeDefined();
  });

  it('throws when the workspace directory does not exist on disk, before disconnecting', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_missing_dir') });
    writeRegistry(tmpDir, [info]);
    // Do NOT create the directory

    const { service, workspace } = await openService(info, fakeIntegrations(['int_a']));
    await fs.rm(info.path, { recursive: true });
    await expect(service.delete(info.id)).rejects.toThrow(/directory not found/i);
    expect(workspace.integrations.disconnect).not.toHaveBeenCalled();
  });

  it('closes the workspace before deleting it', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const { service, workspace } = await openService(info);
    await service.delete(info.id);

    expect(workspace.close).toHaveBeenCalled();
    expect(service.currentWorkspace).toBeNull();
  });

  it('disconnects its integrations, keeping copies, before closing it', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });
    const calls: string[] = [];
    const { service, workspace } = await openService(
      info,
      fakeIntegrations(['int_a', 'int_b'], calls),
    );
    workspace.close.mockImplementation(() => calls.push('close'));

    await service.delete(info.id);

    expect(calls).toEqual(['disconnect int_a', 'disconnect int_b', 'close']);
    expect(workspace.integrations.disconnect).toHaveBeenCalledWith('int_a', {
      keepLocalCopies: true,
    });
  });

  it('deletes the workspace when an integration fails to disconnect', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });
    const integrations = fakeIntegrations(['int_a', 'int_b']);
    integrations.disconnect.mockRejectedValueOnce(new Error('database is locked'));

    const { service } = await openService(info, integrations);
    await service.delete(info.id);

    expect(integrations.disconnect).toHaveBeenCalledTimes(2);
    await expect(fs.stat(info.path)).rejects.toThrow();
  });

  it('removes only the targeted workspace when multiple exist', async () => {
    const a = makeInfo({
      id: 'wsp_aaa' as WorkspaceId,
      path: path.join(tmpDir, 'workspaces', 'wsp_aaa'),
    });
    const b = makeInfo({
      id: 'wsp_bbb' as WorkspaceId,
      name: 'B',
      path: path.join(tmpDir, 'workspaces', 'wsp_bbb'),
    });
    writeRegistry(tmpDir, [a, b]);
    await fs.mkdir(a.path, { recursive: true });
    await fs.mkdir(b.path, { recursive: true });

    const { service } = await openService(a);
    await service.delete(a.id);

    const remaining = service.listAll().items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('wsp_bbb');
    await expect(fs.stat(b.path)).resolves.toBeDefined();
  });
});

describe('WorkspaceService — open', () => {
  it('throws when workspace id is not in registry', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir);
    await expect(service.open('wsp_unknown' as WorkspaceId)).rejects.toThrow(NotFoundError);
  });

  it('throws when workspace directory does not exist', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_missing') });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    await expect(service.open(info.id)).rejects.toThrow(WorkspaceDataMissingError);
    await expect(service.open(info.id)).rejects.toMatchObject({
      code: 'workspace_data_missing',
      workspaceId: info.id,
    });
  });

  it('sets currentWorkspace after a successful open', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);

    expect(service.currentWorkspace).toBe(fakeWorkspace);
  });

  it('updates lastOpenedAt in the registry', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const before = Date.now();
    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);
    const after = Date.now();

    const updated = service.getById(info.id);
    expect(updated.lastOpenedAt).toBeTypeOf('number');
    expect(updated.lastOpenedAt).toBeGreaterThanOrEqual(before);
    expect(updated.lastOpenedAt).toBeLessThanOrEqual(after);
  });

  it('returns the opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    const result = await service.open(info.id);

    expect(result).toBe(fakeWorkspace);
  });

  it('calls Workspace.open (not Workspace.create)', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    vi.mocked(Workspace.open).mockResolvedValue({
      info,
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);

    expect(Workspace.open).toHaveBeenCalledOnce();
    expect(Workspace.create).not.toHaveBeenCalled();
  });
});

describe('WorkspaceService — sync', () => {
  it('open starts syncing the opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);

    expect(fakeWorkspace.sync.start).toHaveBeenCalledOnce();
  });

  it('create does not start syncing: only the open workspace syncs', async () => {
    const created = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(created as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'New', color: '#000000' });

    expect(created.sync.start).not.toHaveBeenCalled();
  });

  it('switch waits for the current workspace to close before opening the next', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    let finishClose!: () => void;
    const prevWorkspace = {
      info: makeInfo({ id: 'wsp_prev' as WorkspaceId }),
      close: vi.fn(() => new Promise<void>((resolve) => (finishClose = resolve))),
    };
    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await setOpenWorkspace(service, prevWorkspace);

    const switching = service.switch(info.id);
    await vi.waitFor(() => expect(prevWorkspace.close).toHaveBeenCalled());
    await new Promise((resolve) => setImmediate(resolve));
    expect(Workspace.open).toHaveBeenCalledOnce();

    finishClose();
    await expect(switching).resolves.toBe(nextWorkspace);
    expect(nextWorkspace.sync.start).toHaveBeenCalledOnce();
  });

  it('opening another workspace closes the current one first', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const prevWorkspace = { info: makeInfo({ id: 'wsp_prev' as WorkspaceId }), close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue({
      info,
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    const service = new WorkspaceService(tmpDir);
    await setOpenWorkspace(service, prevWorkspace);
    await service.open(info.id);

    expect(prevWorkspace.close).toHaveBeenCalledOnce();
  });

  it('delete waits for the current workspace to close before removing its directory', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    let finishClose!: () => void;
    const current = {
      info,
      close: vi.fn(() => new Promise<void>((resolve) => (finishClose = resolve))),
      integrations: fakeIntegrations([]),
    };
    const service = new WorkspaceService(tmpDir);
    await setOpenWorkspace(service, current);

    const deleting = service.delete(info.id);
    await vi.waitFor(() => expect(current.close).toHaveBeenCalled());
    await new Promise((resolve) => setImmediate(resolve));
    expect(fsSync.existsSync(info.path)).toBe(true);

    finishClose();
    await deleting;
    expect(fsSync.existsSync(info.path)).toBe(false);
  });
});

describe('WorkspaceService — switch', () => {
  it('closes current workspace before opening new one', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const prevWorkspace = {
      info: makeInfo({ id: 'wsp_prev' as WorkspaceId }),
      close: vi.fn(),
      sync: { start: vi.fn() },
    };
    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await setOpenWorkspace(service, prevWorkspace);

    await service.switch(info.id);

    expect(prevWorkspace.close).toHaveBeenCalled();
    expect(service.currentWorkspace).toBe(nextWorkspace);
  });

  it('returns the newly opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    const result = await service.switch(info.id);

    expect(result).toBe(nextWorkspace);
  });

  it('works when there is no current workspace (does not close anything)', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    expect(service.currentWorkspace).toBeNull();

    await expect(service.switch(info.id)).resolves.toBe(nextWorkspace);
  });

  it('throws when the target workspace does not exist', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir);
    await expect(service.switch('wsp_nope' as WorkspaceId)).rejects.toThrow();
  });
});

describe('WorkspaceService — workspace options', () => {
  const options = { cipher: new FakeCipher(), fetch: vi.fn() };

  it('passes its options to every workspace it creates', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));
    vi.mocked(Workspace.create).mockResolvedValue({
      info: makeInfo(),
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    await new WorkspaceService(tmpDir, options).create({ name: 'WS', color: '#000000' });

    expect(vi.mocked(Workspace.create).mock.calls[0][1]).toBe(options);
  });

  it('passes its options to every workspace it opens', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });
    vi.mocked(Workspace.open).mockResolvedValue({
      info,
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    await new WorkspaceService(tmpDir, options).open(info.id);

    expect(vi.mocked(Workspace.open)).toHaveBeenCalledWith(info, options);
  });

  it('passes empty options when given none', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });
    vi.mocked(Workspace.open).mockResolvedValue({
      info,
      close: vi.fn(),
      sync: { start: vi.fn() },
    } as never);

    await new WorkspaceService(tmpDir).open(info.id);

    expect(vi.mocked(Workspace.open)).toHaveBeenCalledWith(info, {});
  });
});

describe('WorkspaceService — cursor pagination', () => {
  const infos = Array.from({ length: 5 }, (_, i) =>
    makeInfo({
      id: `wsp_p${i}` as WorkspaceId,
      name: `WS${i}`,
      // pairs share createdAt to exercise the id tiebreaker
      createdAt: 1000 + Math.floor(i / 2),
    }),
  );

  it('returns a null nextCursor when everything fits', () => {
    writeRegistry(tmpDir, infos);
    const page = new WorkspaceService(tmpDir).listAll();
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('pages through every workspace exactly once', () => {
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir);
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = service.listAll({ limit: 2, cursor });
      ids.push(...page.items.map((w) => w.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(ids).toEqual(infos.map((w) => w.id));
  });

  it('rejects invalid limit and garbage cursor', () => {
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir);
    expect(() => service.listAll({ limit: 0 })).toThrow(RangeError);
    expect(() => service.listAll({ cursor: 'bad' })).toThrow();
  });
});

describe('WorkspaceService — overlapping transitions', () => {
  async function setup() {
    const infos = ['first', 'second'].map((name) =>
      makeInfo({
        id: `wsp_${name}` as WorkspaceId,
        name,
        path: path.join(tmpDir, name),
      }),
    );
    writeRegistry(tmpDir, infos);
    await Promise.all(infos.map((info) => fs.mkdir(info.path)));
    const workspaces = infos.map((info) => ({
      info,
      close: vi.fn(async () => {}),
      sync: { start: vi.fn() },
      integrations: fakeIntegrations([]),
    }));
    return { service: new WorkspaceService(tmpDir), infos, workspaces };
  }

  it('serializes open, switch and close, including repeated closes', async () => {
    const { service, infos, workspaces } = await setup();
    const opening = deferred<Workspace>();
    vi.mocked(Workspace.open)
      .mockReturnValueOnce(opening.promise)
      .mockResolvedValueOnce(workspaces[1] as never);
    const first = service.open(infos[0].id);
    const switching = service.switch(infos[1].id);
    const closing = service.close();
    const closingAgain = service.close();
    await vi.waitFor(() => expect(Workspace.open).toHaveBeenCalledOnce());
    expect(service.currentWorkspace).toBeNull();
    opening.resolve(workspaces[0] as never);
    await Promise.all([first, switching, closing, closingAgain]);
    expect(workspaces[0].close).toHaveBeenCalledOnce();
    expect(workspaces[1].close).toHaveBeenCalledOnce();
    expect(service.currentWorkspace).toBeNull();
  });

  it('finishes deletion before opening the next workspace', async () => {
    const { service, infos, workspaces } = await setup();
    vi.mocked(Workspace.open)
      .mockResolvedValueOnce(workspaces[0] as never)
      .mockResolvedValueOnce(workspaces[1] as never);
    await service.open(infos[0].id);
    const closed = deferred<void>();
    workspaces[0].close.mockReturnValueOnce(closed.promise);
    const deleting = service.delete(infos[0].id);
    const switching = service.switch(infos[1].id);
    await vi.waitFor(() => expect(workspaces[0].close).toHaveBeenCalledOnce());
    expect(Workspace.open).toHaveBeenCalledOnce();
    expect(fsSync.existsSync(infos[0].path)).toBe(true);
    closed.resolve(undefined);
    await Promise.all([deleting, switching]);
    expect(fsSync.existsSync(infos[0].path)).toBe(false);
    expect(service.currentWorkspace).toBe(workspaces[1]);
  });

  it('drains an opening workspace on shutdown even when no workspace is current yet', async () => {
    const { service, infos, workspaces } = await setup();
    const opened = deferred<Workspace>();
    vi.mocked(Workspace.open).mockReturnValueOnce(opened.promise);
    const opening = service.open(infos[0].id);
    await vi.waitFor(() => expect(Workspace.open).toHaveBeenCalledOnce());
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    opened.resolve(workspaces[0] as never);
    await Promise.all([opening, closing]);
    expect(workspaces[0].close).toHaveBeenCalledOnce();
    expect(service.currentWorkspace).toBeNull();
  });

  it('cleans up a failed open and allows the next queued transition', async () => {
    const { service, infos, workspaces } = await setup();
    workspaces[0].sync.start.mockImplementationOnce(() => {
      throw new Error('start failed');
    });
    vi.mocked(Workspace.open)
      .mockResolvedValueOnce(workspaces[0] as never)
      .mockResolvedValueOnce(workspaces[1] as never);
    const failed = expect(service.open(infos[0].id)).rejects.toThrow('start failed');
    const next = service.open(infos[1].id);
    await failed;
    await next;
    expect(workspaces[0].close).toHaveBeenCalledOnce();
    expect(service.currentWorkspace).toBe(workspaces[1]);
  });
});
