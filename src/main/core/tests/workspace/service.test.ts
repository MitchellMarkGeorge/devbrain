import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '../../workspace/types';

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

const makeRegistry = (infos: WorkspaceInfo[]): Record<WorkspaceId, WorkspaceInfo> =>
  Object.fromEntries(infos.map((w) => [w.id, w])) as Record<WorkspaceId, WorkspaceInfo>;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-wssvc-'));
  vi.clearAllMocks();
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

describe('WorkspaceService — registry reads', () => {
  it('listAll() returns empty array when workspaces.json is absent', () => {
    const service = new WorkspaceService(tmpDir);
    expect(service.listAll()).toEqual([]);
  });

  it('listAll() returns all workspace infos', () => {
    const infos = [makeInfo(), makeInfo({ id: 'wsp_test002' as WorkspaceId, name: 'Second' })];
    writeRegistry(tmpDir, infos);
    const service = new WorkspaceService(tmpDir);
    expect(service.listAll()).toHaveLength(2);
  });

  it('getById() returns matching workspace info', () => {
    const info = makeInfo();
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getById(info.id)).toMatchObject({ id: info.id, name: info.name });
  });

  it('getById() returns null for unknown id', () => {
    writeRegistry(tmpDir, [makeInfo()]);
    const service = new WorkspaceService(tmpDir);
    expect(service.getById('wsp_unknown' as WorkspaceId)).toBeNull();
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

    const fakeWorkspace = { info: makeInfo(), close: vi.fn() };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'New WS', color: '#ff0000' });

    expect(service.listAll()).toHaveLength(1);
    expect(service.listAll()[0].name).toBe('New WS');
  });

  it('persists the workspace color', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const fakeWorkspace = { info: makeInfo(), close: vi.fn() };
    vi.mocked(Workspace.create).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'Coloured', color: '#aabbcc' });

    expect(service.listAll()[0].color).toBe('#aabbcc');
  });

  it('creates unique ids for multiple workspaces', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    vi.mocked(Workspace.create).mockResolvedValue({ info: makeInfo(), close: vi.fn() } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'WS 1', color: '#000000' });
    await service.create({ name: 'WS 2', color: '#000000' });

    const all = service.listAll();
    expect(all).toHaveLength(2);
    expect(all[0].id).not.toBe(all[1].id);
  });

  it('calls Workspace.create with the generated workspace info', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    const fakeWorkspace = { info: makeInfo(), close: vi.fn() };
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
    vi.mocked(Workspace.create).mockResolvedValue({ info: makeInfo(), close: vi.fn() } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'Timestamp', color: '#000000' });
    const after = Date.now();

    const created = service.listAll()[0];
    expect(created.createdAt).toBeGreaterThanOrEqual(before);
    expect(created.createdAt).toBeLessThanOrEqual(after);
  });

  it('new workspace has lastOpenedAt as null', async () => {
    writeRegistry(tmpDir, []);
    await fs.mkdir(path.join(tmpDir, 'workspaces'));

    vi.mocked(Workspace.create).mockResolvedValue({ info: makeInfo(), close: vi.fn() } as never);

    const service = new WorkspaceService(tmpDir);
    await service.create({ name: 'New', color: '#000000' });

    expect(service.listAll()[0].lastOpenedAt).toBeNull();
  });
});

describe('WorkspaceService — delete', () => {
  it('removes the workspace from the registry', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const service = new WorkspaceService(tmpDir);
    await service.delete(info.id);

    expect(service.listAll()).toHaveLength(0);
  });

  it('removes the workspace directory from the filesystem', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const service = new WorkspaceService(tmpDir);
    await service.delete(info.id);

    await expect(fs.stat(info.path)).rejects.toThrow();
  });

  it('throws when no matching workspace exists in registry', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir);
    await expect(service.delete('wsp_missing' as WorkspaceId)).rejects.toThrow();
  });

  it('throws when the workspace directory does not exist on disk', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_missing_dir') });
    writeRegistry(tmpDir, [info]);
    // Do NOT create the directory

    const service = new WorkspaceService(tmpDir);
    await expect(service.delete(info.id)).rejects.toThrow(/directory not found/i);
  });

  it('closes the current workspace before deleting it', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn() };

    const service = new WorkspaceService(tmpDir);
    service.currentWorkspace = fakeWorkspace as never;

    await service.delete(info.id);
    expect(fakeWorkspace.close).toHaveBeenCalled();
    expect(service.currentWorkspace).toBeNull();
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

    const service = new WorkspaceService(tmpDir);
    await service.delete(a.id);

    const remaining = service.listAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('wsp_bbb');
  });
});

describe('WorkspaceService — open', () => {
  it('throws when workspace id is not in registry', async () => {
    writeRegistry(tmpDir, []);
    const service = new WorkspaceService(tmpDir);
    await expect(service.open('wsp_unknown' as WorkspaceId)).rejects.toThrow();
  });

  it('throws when workspace directory does not exist', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_missing') });
    writeRegistry(tmpDir, [info]);
    const service = new WorkspaceService(tmpDir);
    await expect(service.open(info.id)).rejects.toThrow();
  });

  it('sets currentWorkspace after a successful open', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);

    expect(service.currentWorkspace).toBe(fakeWorkspace);
  });

  it('updates lastOpenedAt in the registry', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const before = Date.now();
    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);
    const after = Date.now();

    const updated = service.getById(info.id);
    expect(updated?.lastOpenedAt).toBeTypeOf('number');
    expect(updated?.lastOpenedAt).toBeGreaterThanOrEqual(before);
    expect(updated?.lastOpenedAt).toBeLessThanOrEqual(after);
  });

  it('returns the opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const fakeWorkspace = { info, close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue(fakeWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    const result = await service.open(info.id);

    expect(result).toBe(fakeWorkspace);
  });

  it('calls Workspace.open (not Workspace.create)', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    vi.mocked(Workspace.open).mockResolvedValue({ info, close: vi.fn() } as never);

    const service = new WorkspaceService(tmpDir);
    await service.open(info.id);

    expect(Workspace.open).toHaveBeenCalledOnce();
    expect(Workspace.create).not.toHaveBeenCalled();
  });
});

describe('WorkspaceService — switch', () => {
  it('closes current workspace before opening new one', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const prevWorkspace = { info: makeInfo({ id: 'wsp_prev' as WorkspaceId }), close: vi.fn() };
    const nextWorkspace = { info, close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    service.currentWorkspace = prevWorkspace as never;

    await service.switch(info.id);

    expect(prevWorkspace.close).toHaveBeenCalled();
    expect(service.currentWorkspace).toBe(nextWorkspace);
  });

  it('returns the newly opened workspace', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn() };
    vi.mocked(Workspace.open).mockResolvedValue(nextWorkspace as never);

    const service = new WorkspaceService(tmpDir);
    const result = await service.switch(info.id);

    expect(result).toBe(nextWorkspace);
  });

  it('works when there is no current workspace (does not close anything)', async () => {
    const info = makeInfo({ path: path.join(tmpDir, 'workspaces', 'wsp_test001') });
    writeRegistry(tmpDir, [info]);
    await fs.mkdir(info.path, { recursive: true });

    const nextWorkspace = { info, close: vi.fn() };
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
