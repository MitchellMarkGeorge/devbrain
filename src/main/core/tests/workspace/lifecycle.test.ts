import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceService } from '../../workspace/service';
import { Workspace } from '../../workspace/workspace';
import { NotFoundError, WorkspaceMigrationError } from '../../shared/errors';
import type { WorkspaceId } from '@common/ids';
import { deferred, migrationsWithExtra, WORKSPACE_OPTIONS } from '../utils';

let root: string;
let service: WorkspaceService;
let ids: WorkspaceId[];
const releases: (() => void)[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-lifecycle-'));
  service = new WorkspaceService(root, WORKSPACE_OPTIONS);
  ids = [];
  for (const name of ['A', 'B']) {
    const info = await service.create({ name, color: '#000000' });
    ids.push(info.id);
  }
});

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await service.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

// Open real SQLite and construct real services, then hold publication to reproduce overlap.
function holdOpen() {
  const reached = deferred<Workspace>();
  const held = deferred<void>();
  const realOpen = Workspace.open.bind(Workspace);
  const release = () => held.resolve(undefined);
  releases.push(release);
  vi.spyOn(Workspace, 'open').mockImplementationOnce(async (...args) => {
    const workspace = await realOpen(...args);
    reached.resolve(workspace);
    await held.promise;
    return workspace;
  });
  return { reached: reached.promise, release };
}

describe('WorkspaceService — real overlapping transitions', () => {
  it('opens in call order and closes the first workspace before publishing the second', async () => {
    const [first, second] = await Promise.all([service.open(ids[0]), service.open(ids[1])]);
    expect(first.info.id).toBe(ids[0]);
    expect(second.info.id).toBe(ids[1]);
    expect(service.currentWorkspace).toBe(second);
    expect(() => first.tasks.listTasks()).toThrow();
    expect(second.tasks.listTasks()).toMatchObject({ items: [] });
  });

  it('switches after a pending open and closes the workspace it opened', async () => {
    const gate = holdOpen();
    const opening = service.open(ids[0]);
    const first = await gate.reached;
    const switching = service.open(ids[1]);
    expect(service.currentWorkspace).toBeNull();
    gate.release();
    await opening;
    const second = await switching;
    expect(service.currentWorkspace).toBe(second);
    expect(() => first.tasks.listTasks()).toThrow();
  });

  it('waits for opening before closing, including repeated close calls', async () => {
    const gate = holdOpen();
    const opening = service.open(ids[0]);
    const workspace = await gate.reached;
    let closed = false;
    const closing = service.close().then(() => {
      closed = true;
    });
    const again = service.close();
    await Promise.resolve();
    expect(closed).toBe(false);
    gate.release();
    await Promise.all([opening, closing, again]);
    expect(service.currentWorkspace).toBeNull();
    expect(() => workspace.tasks.listTasks()).toThrow();
  });

  it('deletes a workspace whose open is still pending', async () => {
    const gate = holdOpen();
    const opening = service.open(ids[0]);
    const workspace = await gate.reached;
    const deleting = service.delete(ids[0]);
    gate.release();
    await Promise.all([opening, deleting]);
    expect(service.currentWorkspace).toBeNull();
    expect(() => service.getById(ids[0])).toThrow(NotFoundError);
    await expect(fs.stat(workspace.info.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => workspace.tasks.listTasks()).toThrow();
  });

  it('rejects an open queued behind deletion of the same workspace', async () => {
    const workspace = await service.open(ids[0]);
    const deleting = service.delete(ids[0]);
    const reopening = expect(service.open(ids[0])).rejects.toBeInstanceOf(NotFoundError);
    await Promise.all([deleting, reopening]);
    expect(service.currentWorkspace).toBeNull();
    await expect(fs.stat(workspace.info.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('continues the queue after a real migration failure', async () => {
    const broken = migrationsWithExtra(
      path.join(root, 'broken'),
      '0099_broken',
      'SELECT * FROM no_such_table;',
    );
    const realOpen = Workspace.open.bind(Workspace);
    vi.spyOn(Workspace, 'open').mockImplementationOnce((info, options) =>
      realOpen(info, { ...options, migrationsPath: broken }),
    );
    const failed = expect(service.open(ids[0])).rejects.toBeInstanceOf(WorkspaceMigrationError);
    const next = service.open(ids[1]);
    await failed;
    const workspace = await next;
    expect(service.currentWorkspace).toBe(workspace);
    expect(workspace.tasks.listTasks()).toMatchObject({ items: [] });
  });
});
