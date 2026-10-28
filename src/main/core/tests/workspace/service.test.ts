import { deferred, WORKSPACE_OPTIONS } from '../utils';
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

import { WorkspaceService, type WorkspaceChange } from '../../workspace/service';
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
  list: vi.fn(() => ids.map((id) => ({ id }))),
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.listAll().items).toEqual([]);
  });

  it('listAll() returns all workspace infos', () => {
    const infos = [makeInfo(), makeInfo({ id: 'wsp_test002' as WorkspaceId, name: 'Second' })];
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.listAll().items).toHaveLength(2);
  });

  it('getById() returns matching workspace info', () => {
    const info = makeInfo();
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.getById(info.id)).toMatchObject({ id: info.id, name: info.name });
  });

  it('getById() throws NotFoundError for unknown id', () => {
    writeRegistry(tmpDir, [makeInfo()]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(() => service.getById('wsp_unknown' as WorkspaceId)).toThrow(NotFoundError);
  });

  it('getByName() returns matching workspace info', () => {
    const info = makeInfo({ name: 'Unique Name' });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.getByName('Unique Name')).toMatchObject({ id: info.id });
  });

  it('getByName() returns null for unknown name', () => {
    writeRegistry(tmpDir, [makeInfo()]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.getByName('Unknown')).toBeNull();
  });

  it('getByName() is case-sensitive', () => {
    const info = makeInfo({ name: 'MyWorkspace' });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await service.create({ name: 'New WS', color: '#ff0000' });

    expect(service.listAll().items).toHaveLength(1);
    expect(service.listAll().items[0].name).toBe('New WS');
  });

  it('persists the workspace color', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const fakeWorkspace = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await service.create({ name: 'New', color: '#000000' });

    expect(service.listAll().items[0].lastOpenedAt).toBeNull();
  });
});

describe('WorkspaceService — delete', () => {
  // a service whose open workspace is `info`, as WorkspaceService.open leaves it
  async function openService(info: WorkspaceInfo, integrations = fakeIntegrations([])) {
    const workspace = { info, close: vi.fn(), integrations };
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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
    await expect(new WorkspaceService(tmpDir, WORKSPACE_OPTIONS).delete(info.id)).rejects.toThrow(
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await expect(service.open('wsp_unknown' as WorkspaceId)).rejects.toThrow(NotFoundError);
  });

  it('throws when workspace directory does not exist', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_missing') });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await service.open(info.id);

    expect(fakeWorkspace.sync.start).toHaveBeenCalledOnce();
  });

  it('create leaves the workspace closed and not current: only an opened one is', async () => {
    const created = { info: makeInfo(), close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.create).mockResolvedValue(created as never);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    const types: string[] = [];
    service.onChange((change) => types.push(change.type));

    const info = await service.create({ name: 'New', color: '#000000' });

    expect(created.sync.start).not.toHaveBeenCalled();
    expect(created.close).toHaveBeenCalledOnce();
    expect(service.currentWorkspace).toBeNull();
    expect(types).toEqual(['created']);
    expect(info).toEqual(service.getById(info.id));
  });

  it('open waits for the current workspace to close before opening the next', async () => {
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await setOpenWorkspace(service, prevWorkspace);

    const switching = service.open(info.id);
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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

describe('WorkspaceService — opening while another is open', () => {
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

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await setOpenWorkspace(service, prevWorkspace);

    await service.open(info.id);

    expect(prevWorkspace.close).toHaveBeenCalled();
    expect(service.currentWorkspace).toBe(nextWorkspace);
  });

  it('returns the newly opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    const result = await service.open(info.id);

    expect(result).toBe(nextWorkspace);
  });

  it('works when there is no current workspace (does not close anything)', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn(), sync: { start: vi.fn() } };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(service.currentWorkspace).toBeNull();

    await expect(service.open(info.id)).resolves.toBe(nextWorkspace);
  });

  it('throws when the target workspace does not exist', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    await expect(service.open('wsp_nope' as WorkspaceId)).rejects.toThrow();
  });
});

describe('WorkspaceService — workspace options', () => {
  const options = { ...WORKSPACE_OPTIONS, cipher: new FakeCipher(), fetch: vi.fn() };

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
    const page = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS).listAll();
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('pages through every workspace exactly once', () => {
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
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
    const service = new WorkspaceService(tmpDir, WORKSPACE_OPTIONS);
    expect(() => service.listAll({ limit: 0 })).toThrow(RangeError);
    expect(() => service.listAll({ cursor: 'bad' })).toThrow();
  });
});

describe('WorkspaceService — onChange', () => {
  // two workspaces in the registry, with directories, and a service recording every change
  async function setup(options = WORKSPACE_OPTIONS) {
    const infos = ['first', 'second'].map((name) =>
      makeInfo({ id: `wsp_${name}` as WorkspaceId, name, path: path.join(tmpDir, name) }),
    );
    writeRegistry(tmpDir, infos);
    await Promise.all(infos.map((info) => fs.mkdir(info.path)));
    // what happened, in order: lifecycle calls on the workspaces and the changes sent
    const log: string[] = [];
    const workspaces = infos.map((info) => ({
      info,
      close: vi.fn(async () => void log.push(`close ${info.id}`)),
      sync: { start: vi.fn() },
      integrations: fakeIntegrations([]),
    }));
    const service = new WorkspaceService(tmpDir, options);
    const changes: WorkspaceChange[] = [];
    service.onChange((change) => {
      changes.push(change);
      const id =
        change.type === 'opened'
          ? change.workspace.info.id
          : change.type === 'created'
            ? change.workspace.id
            : change.workspaceId;
      log.push(`${change.type} ${id}`);
    });
    return { service, infos, workspaces, changes, log };
  }

  it('open sends opened once the workspace is current', async () => {
    const { service, infos, workspaces, changes } = await setup();
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    let currentWhenSent: unknown;
    service.onChange(() => (currentWhenSent = service.currentWorkspace));

    await service.open(infos[0].id);

    expect(changes).toEqual([{ type: 'opened', workspace: workspaces[0] }]);
    expect(currentWhenSent).toBe(workspaces[0]);
  });

  it('opening another sends closed for the old workspace, once it has closed, before opened for the new one', async () => {
    const { service, infos, workspaces, changes, log } = await setup();
    vi.mocked(Workspace.open)
      .mockResolvedValueOnce(workspaces[0] as never)
      .mockResolvedValueOnce(workspaces[1] as never);
    await service.open(infos[0].id);

    await service.open(infos[1].id);

    expect(changes).toEqual([
      { type: 'opened', workspace: workspaces[0] },
      { type: 'closed', workspaceId: infos[0].id },
      { type: 'opened', workspace: workspaces[1] },
    ]);
    expect(log).toEqual([
      'opened wsp_first',
      'close wsp_first',
      'closed wsp_first',
      'opened wsp_second',
    ]);
  });

  it('close sends closed once the workspace has closed', async () => {
    const { service, infos, workspaces, changes, log } = await setup();
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    await service.open(infos[0].id);

    await service.close();

    expect(changes.at(-1)).toEqual({ type: 'closed', workspaceId: infos[0].id });
    expect(log.slice(-2)).toEqual(['close wsp_first', 'closed wsp_first']);
  });

  it('delete sends closed once the workspace has closed, then deleted once it is unregistered', async () => {
    const { service, infos, workspaces, changes, log } = await setup();
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    await service.open(infos[0].id);
    let registeredWhenSent: boolean | null = null;
    service.onChange((change) => {
      if (change.type === 'deleted') registeredWhenSent = service.getByName('first') !== null;
    });

    await service.delete(infos[0].id);

    expect(changes).toEqual([
      { type: 'opened', workspace: workspaces[0] },
      { type: 'closed', workspaceId: infos[0].id },
      { type: 'deleted', workspaceId: infos[0].id },
    ]);
    expect(log.slice(-3)).toEqual(['close wsp_first', 'closed wsp_first', 'deleted wsp_first']);
    expect(registeredWhenSent).toBe(false);
  });

  it('create sends created last, once the database exists and the registry has the workspace', async () => {
    const { service, changes, log } = await setup();
    let registeredWhenSent: boolean | null = null;
    service.onChange((change) => {
      if (change.type === 'created') registeredWhenSent = service.getByName('New') !== null;
    });
    vi.mocked(Workspace.create).mockImplementationOnce(async (info) => {
      log.push('database created');
      return { info, close: vi.fn(async () => void log.push('database closed')) } as never;
    });

    const info = await service.create({ name: 'New', color: '#000000' });

    expect(changes).toEqual([{ type: 'created', workspace: info }]);
    expect(log).toEqual(['database created', 'database closed', `created ${info.id}`]);
    expect(registeredWhenSent).toBe(true);
  });

  it('a create whose database fails registers nothing, removes its directory and sends nothing', async () => {
    const { service, changes } = await setup();
    let createdPath: string | null = null;
    vi.mocked(Workspace.create).mockImplementationOnce(async (info) => {
      createdPath = info.path;
      throw new Error('migration failed');
    });

    await expect(service.create({ name: 'New', color: '#000000' })).rejects.toThrow(
      'migration failed',
    );

    expect(service.getByName('New')).toBeNull();
    expect(createdPath).not.toBeNull();
    expect(fsSync.existsSync(createdPath!)).toBe(false);
    expect(changes).toEqual([]);
  });

  it('sends nothing when nothing changes', async () => {
    const { service, infos, workspaces, changes } = await setup();
    // closing with no workspace open
    await service.close();
    // opening an unknown workspace, or one whose directory is gone
    await expect(service.open('wsp_nope' as WorkspaceId)).rejects.toThrow(NotFoundError);
    await fs.rm(infos[1].path, { recursive: true });
    await expect(service.open(infos[1].id)).rejects.toThrow(WorkspaceDataMissingError);
    // deleting a workspace that is not open
    await expect(service.delete(infos[0].id)).rejects.toThrow(WorkspaceNotOpenError);
    // a workspace that fails to start syncing never becomes current
    workspaces[0].sync.start.mockImplementationOnce(() => {
      throw new Error('start failed');
    });
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    await expect(service.open(infos[0].id)).rejects.toThrow('start failed');

    expect(changes).toEqual([]);
    expect(service.currentWorkspace).toBeNull();
  });

  it('sends closed even when closing fails, as the workspace is no longer current', async () => {
    const { service, infos, workspaces, changes } = await setup();
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    await service.open(infos[0].id);
    workspaces[0].close.mockRejectedValueOnce(new Error('close failed'));

    await expect(service.close()).rejects.toThrow('close failed');

    expect(changes.at(-1)).toEqual({ type: 'closed', workspaceId: infos[0].id });
    expect(service.currentWorkspace).toBeNull();
  });

  it('a listener that throws is logged and fails neither the call nor the other listeners', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { service, infos, workspaces, changes } = await setup({ ...WORKSPACE_OPTIONS, logger });
    service.onChange(() => {
      throw new TypeError('listener failed');
    });
    const after = vi.fn();
    service.onChange(after);
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);

    await expect(service.open(infos[0].id)).resolves.toBe(workspaces[0]);
    await expect(service.close()).resolves.toBeUndefined();

    expect(changes.map((change) => change.type)).toEqual(['opened', 'closed']);
    expect(after).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('Workspace change listener threw error=TypeError');
    expect(workspaces[0].close).toHaveBeenCalledOnce();
  });

  it('stops sending to a listener once it unsubscribes', async () => {
    const { service, infos, workspaces } = await setup();
    const listener = vi.fn();
    const unsubscribe = service.onChange(listener);
    vi.mocked(Workspace.open).mockResolvedValueOnce(workspaces[0] as never);
    await service.open(infos[0].id);

    unsubscribe();
    await service.close();

    expect(listener).toHaveBeenCalledOnce();
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
    return { service: new WorkspaceService(tmpDir, WORKSPACE_OPTIONS), infos, workspaces };
  }

  it('serializes opens and closes, including repeated closes', async () => {
    const { service, infos, workspaces } = await setup();
    const opening = deferred<Workspace>();
    vi.mocked(Workspace.open)
      .mockReturnValueOnce(opening.promise)
      .mockResolvedValueOnce(workspaces[1] as never);
    const first = service.open(infos[0].id);
    const switching = service.open(infos[1].id);
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
    const switching = service.open(infos[1].id);
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
