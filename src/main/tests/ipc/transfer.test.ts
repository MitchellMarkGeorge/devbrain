import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import type { TaskImportSummary } from '@main/core/transfer/types';
import { ChangeTracker } from '@main/ipc/changes';
import type { Desktop } from '@main/ipc/desktop';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { TaskPriority } from '@main/core/tasks/types';
import type { TaskService } from '@main/core/tasks/service';
import type { NoteService } from '@main/core/notes/service';
import { collectPages } from '@main/core/shared/pagination';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// Show in Finder and the import and export routes, end to end through the transport, over a real
// DevBrain folder, with a fake desktop standing in for Electron's shell and dialogs.

const oldestFirst = { sortBy: 'createdAt', direction: 'asc' } as const;
const allTasks = (tasks: TaskService) =>
  collectPages((page) => tasks.listTasks({}, oldestFirst, page));
const allNotes = (notes: NoteService) =>
  collectPages((page) => notes.listNotes({}, oldestFirst, page));

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let desktop: { [K in keyof Desktop]: ReturnType<typeof vi.fn> };
let files: string;

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  files = path.join(devBrain.path, '..', 'files');
  await fs.mkdir(files);
  desktop = {
    openFolder: vi.fn(async () => {}),
    chooseFiles: vi.fn(async () => null),
    chooseFolder: vi.fn(async () => null),
    chooseSaveFile: vi.fn(async () => null),
  };
  const tracker = new ChangeTracker(vi.fn());
  tracker.watch(devBrain);
  attachRouter(appRouter, {
    createContext: testContext(devBrain, desktop as unknown as Desktop),
    changeTracker: tracker,
  });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

async function openWorkspace(): Promise<Workspace> {
  return devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
}

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

describe('Show in Finder', () => {
  it('opens the data folder DevBrain opened, whatever the devBrainPath setting says', async () => {
    devBrain.settings.set('settings.devBrainPath', '/somewhere/else');
    expect(await call('settings.showDataFolder', undefined, 'mutation')).toMatchObject({
      ok: true,
      changed: [],
    });
    expect(desktop.openFolder).toHaveBeenCalledWith(devBrain.path);
  });

  it("opens the open workspace's folder, and needs one open", async () => {
    expect(code(await call('workspace.showInFolder', undefined, 'mutation'))).toBe(
      'no_workspace_open',
    );
    const workspace = await openWorkspace();
    expect(await call('workspace.showInFolder', undefined, 'mutation')).toMatchObject({ ok: true });
    expect(desktop.openFolder).toHaveBeenCalledWith(workspace.info.path);
  });

  it('takes no path from the renderer', async () => {
    await openWorkspace();
    await call('workspace.showInFolder', { path: '/etc' }, 'mutation');
    await call('settings.showDataFolder', { path: '/etc' }, 'mutation');
    expect(desktop.openFolder).not.toHaveBeenCalledWith('/etc');
  });
});

describe('importing tasks', () => {
  it('returns null and changes nothing when the dialog is cancelled', async () => {
    await openWorkspace();
    expect(await call('transfer.importTasks', undefined, 'mutation')).toEqual({
      ok: true,
      data: null,
      changed: [],
    });
  });

  it('imports the file chosen through TaskService, so search and changed follow', async () => {
    const workspace = await openWorkspace();
    const file = path.join(files, 'tasks.csv');
    await fs.writeFile(file, 'title,priority\nWrite the launch post,\nBad,urgent\n');
    desktop.chooseFiles.mockResolvedValueOnce([file]);
    devBrain.settings.set('settings.tasks.defaultPriority', TaskPriority.HIGH);

    const result = await call<TaskImportSummary>('transfer.importTasks', undefined, 'mutation');
    expect(result).toMatchObject({
      ok: true,
      data: { created: 1, errors: [{ row: 3, title: 'Bad' }] },
      changed: ['task'],
    });
    expect(desktop.chooseFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ extensions: ['csv', 'json'] })],
      }),
    );
    // the default priority comes from the settings
    expect(allTasks(workspace.tasks)).toEqual([
      expect.objectContaining({ title: 'Write the launch post', priority: TaskPriority.HIGH }),
    ]);
    expect(
      workspace.search.search({ query: 'launch', entityType: ['task'] }).map(({ title }) => title),
    ).toEqual(['Write the <b>launch</b> post']);
  });

  it("fails with core's import_file for a file it can't read", async () => {
    await openWorkspace();
    const file = path.join(files, 'tasks.json');
    await fs.writeFile(file, '{oops');
    desktop.chooseFiles.mockResolvedValueOnce([file]);
    const result = await call('transfer.importTasks', undefined, 'mutation');
    expect(result).toMatchObject({
      ok: false,
      error: {
        data: { code: 'import_file', data: { reason: 'malformed', fileName: 'tasks.json' } },
      },
    });
  });

  it('writes nothing to a workspace closed while the dialog was open', async () => {
    const workspace = await openWorkspace();
    const file = path.join(files, 'tasks.csv');
    await fs.writeFile(file, 'title\nLate\n');
    desktop.chooseFiles.mockImplementationOnce(async () => {
      await devBrain.workspaces.close();
      return [file];
    });
    expect(code(await call('transfer.importTasks', undefined, 'mutation'))).toBe(
      'workspace_closed',
    );
    await devBrain.workspaces.open(workspace.info.id);
    expect(allTasks(devBrain.currentWorkspace!.tasks)).toEqual([]);
  });
});

describe('importing notes', () => {
  it('imports the Markdown files chosen', async () => {
    const workspace = await openWorkspace();
    const a = path.join(files, 'a.md');
    const b = path.join(files, 'b.md');
    await fs.writeFile(a, '---\ntitle: Standup\n---\nNotes');
    await fs.writeFile(b, 'More');
    desktop.chooseFiles.mockResolvedValueOnce([a, b]);
    expect(await call('transfer.importNotes', undefined, 'mutation')).toMatchObject({
      ok: true,
      data: { created: 2 },
      changed: ['note'],
    });
    expect(desktop.chooseFiles).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
    expect(allNotes(workspace.notes).map(({ title }) => title)).toEqual(['Standup', 'b']);
  });
});

describe('exporting', () => {
  it('writes tasks to the file the save dialog returns, named for the format', async () => {
    const workspace = await openWorkspace();
    workspace.tasks.createTask({ title: 'Exported', dueDate: new Date(2026, 10, 2) });
    const target = path.join(files, 'tasks.json');
    desktop.chooseSaveFile.mockResolvedValueOnce(target);

    expect(await call('transfer.exportTasks', { format: 'json' }, 'mutation')).toEqual({
      ok: true,
      data: { path: target, format: 'json', count: 1 },
      changed: [],
    });
    expect(desktop.chooseSaveFile).toHaveBeenCalledWith(
      expect.objectContaining({ defaultName: expect.stringMatching(/^DevBrain tasks .*\.json$/) }),
    );
    expect(JSON.parse(await fs.readFile(target, 'utf8')).tasks[0].title).toBe('Exported');
    expect(code(await call('transfer.exportTasks', { format: 'xlsx' }, 'mutation'))).toBe(
      'invalid_input',
    );
  });

  it('writes notes into a new folder inside the one chosen', async () => {
    const workspace = await openWorkspace();
    await workspace.notes.createNote({ title: 'Plan', content: 'Steps' });
    desktop.chooseFolder.mockResolvedValueOnce(files);

    const result = await call<{ path: string; count: number }>(
      'transfer.exportNotes',
      undefined,
      'mutation',
    );
    expect(result).toMatchObject({ ok: true, data: { count: 1 } });
    const folder = (result as { data: { path: string } }).data.path;
    expect(path.dirname(folder)).toBe(files);
    expect(await fs.readdir(folder)).toEqual(['Plan.md']);
  });

  it('returns null when a dialog is cancelled', async () => {
    await openWorkspace();
    expect(await call('transfer.exportTasks', { format: 'csv' }, 'mutation')).toMatchObject({
      data: null,
    });
    expect(await call('transfer.exportNotes', undefined, 'mutation')).toMatchObject({
      data: null,
    });
  });
});
