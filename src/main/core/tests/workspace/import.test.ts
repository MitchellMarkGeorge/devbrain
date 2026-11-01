import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { WorkspaceId } from '@common/ids';
import { integrations } from '@main/db/schema/integrations';
import { WorkspaceService, type WorkspaceChange } from '../../workspace/service';
import { MANIFEST_FILE, readManifest, writeManifest } from '../../workspace/manifest';
import {
  moveDetailsToManifests,
  recoverRegistry,
  REGISTRY_BACKUP_FILE,
  REGISTRY_FILE,
} from '../../workspace/registry';
import { DevBrain } from '../../devbrain';
import { scaffoldDevBrain } from '../../local/scaffold';
import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';
import type { WorkspaceInfo } from '../../workspace/types';
import {
  FileExistsError,
  InvalidInputError,
  WorkspaceImportError,
  WorkspaceTooNewError,
} from '../../shared/errors';
import { AuthType, IntegrationStatus, Provider } from '../../integrations/types';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { MIGRATIONS_PATH, WORKSPACE_OPTIONS } from '../utils';

// Moving a workspace between computers: `here` and `there` are two DevBrain folders, each as its
// own computer sees it, and `carried` is where the user puts a folder copied from one to the other.

let dir: string;
let there: WorkspaceService;
let here: WorkspaceService;
let hereRoot: string;
let carried: string;

const thereCipher = new FakeCipher();
const hereCipher = new FakeCipher();

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-import-'));
  // each computer's safeStorage has its own key: a blob from there doesn't decrypt here
  thereCipher.keyVersion = 2;
  hereCipher.keyVersion = 1;
  there = new WorkspaceService(path.join(dir, 'there'), {
    ...WORKSPACE_OPTIONS,
    cipher: thereCipher,
  });
  hereRoot = path.join(dir, 'here');
  await fs.mkdir(path.join(hereRoot, 'workspaces'), { recursive: true });
  here = new WorkspaceService(hereRoot, { ...WORKSPACE_OPTIONS, cipher: hereCipher });
  carried = path.join(dir, 'carried');
  await fs.mkdir(carried);
});

afterEach(async () => {
  await there.close();
  await here.close();
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

// a workspace made there, with a task and a note, copied into `carried` under `folderName`
async function carryWorkspace(folderName = 'My workspace'): Promise<{
  original: WorkspaceInfo;
  folder: string;
  noteId: string;
}> {
  const original = await there.create({ name: 'Acme', color: '#3b82f6' });
  const workspace = await there.open(original.id);
  workspace.tasks.createTask({ title: 'Ship the importer', dueDate: new Date() });
  const note = await workspace.notes.createNote({ title: 'Plan' });
  await workspace.notes.updateNoteContent(note.id, 'Bring the folder over');
  await there.close();
  const folder = path.join(carried, folderName);
  await fs.cp(original.path, folder, { recursive: true });
  return { original, folder, noteId: note.id };
}

function registryIds(root: string): string[] {
  const file = path.join(root, REGISTRY_FILE);
  if (!fsSync.existsSync(file)) return [];
  return Object.keys(JSON.parse(fsSync.readFileSync(file, 'utf8')));
}

function withDatabase<T>(folder: string, run: (sqlite: Database.Database) => T): T {
  const sqlite = new Database(path.join(folder, 'db.sqlite'));
  try {
    return run(sqlite);
  } finally {
    sqlite.close();
  }
}

describe('WorkspaceService.import — success', () => {
  it('copies the folder in, keeps its id, name and colour, and opens with its data', async () => {
    const { original, folder, noteId } = await carryWorkspace();
    const changes: WorkspaceChange[] = [];
    here.onChange((change) => changes.push(change));

    const info = await here.import(folder);

    expect(info).toMatchObject({
      id: original.id,
      name: 'Acme',
      color: '#3b82f6',
      createdAt: original.createdAt,
      lastOpenedAt: null,
      path: path.join(await fs.realpath(path.join(hereRoot, 'workspaces')), original.id),
    });
    expect(here.getById(original.id)).toEqual(info);
    expect(changes).toEqual([{ type: 'imported', workspace: info }]);

    const workspace = await here.open(info.id);
    expect(workspace.tasks.listTasks().items.map((task) => task.title)).toEqual([
      'Ship the importer',
    ]);
    // notes are read from the new folder, not from the path they were written at
    expect(workspace.notes.getById(noteId as never).title).toBe('Plan');
    const noteFile = await fs.readFile(path.join(info.path, 'notes', `${noteId}.md`), 'utf8');
    expect(noteFile).toContain('Bring the folder over');
  });

  it('leaves the chosen folder as it was, and a delete removes only the copy', async () => {
    const { folder } = await carryWorkspace();
    const before = (await fs.readdir(folder)).sort();
    const dbBefore = await fs.readFile(path.join(folder, 'db.sqlite'));

    const info = await here.import(folder);
    await here.open(info.id);
    await here.delete(info.id);

    expect((await fs.readdir(folder)).sort()).toEqual(before);
    expect(await fs.readFile(path.join(folder, 'db.sqlite'))).toEqual(dbBefore);
    expect(fsSync.existsSync(info.path)).toBe(false);
  });

  it("doesn't copy the other computer's backup or shared-memory file", async () => {
    const { folder } = await carryWorkspace();
    await fs.writeFile(path.join(folder, 'db.sqlite.backup'), 'old');
    await fs.writeFile(path.join(folder, 'db.sqlite-shm'), 'stale');

    const info = await here.import(folder);

    expect(fsSync.existsSync(path.join(info.path, 'db.sqlite-shm'))).toBe(false);
    // the backup there now is the one taken by this import's own open
    expect(await fs.readFile(path.join(info.path, 'db.sqlite.backup'), 'utf8')).not.toBe('old');
  });

  it('without a manifest, is named after the folder, grey, under a new id', async () => {
    const { folder, original } = await carryWorkspace('Side projects');
    await fs.rm(path.join(folder, MANIFEST_FILE));

    const info = await here.import(folder);

    expect(info.name).toBe('Side projects');
    expect(info.color).toBe('#808080');
    expect(info.id).not.toBe(original.id);
    expect(info.id).toMatch(/^wsp_/);
    // and now has one, so the next move keeps the name
    expect(readManifest(info.path)).toMatchObject({ id: info.id, name: 'Side projects' });
  });

  it('without a manifest, keeps the id a folder named after one carries', async () => {
    const { folder, original } = await carryWorkspace();
    await fs.rm(path.join(folder, MANIFEST_FILE));
    const named = path.join(carried, original.id);
    await fs.rename(folder, named);

    expect((await here.import(named)).id).toBe(original.id);
  });

  it('registers in place a folder already in workspaces/ but not in the list', async () => {
    const { folder, original } = await carryWorkspace();
    const destination = path.join(hereRoot, 'workspaces', original.id);
    await fs.cp(folder, destination, { recursive: true });

    const info = await here.import(destination);

    expect(info.path).toBe(await fs.realpath(destination));
    expect(registryIds(hereRoot)).toEqual([original.id]);
  });

  it('migrates a database from an older DevBrain', async () => {
    const olderMigrations = path.join(dir, 'older-migrations');
    fsSync.cpSync(MIGRATIONS_PATH, olderMigrations, { recursive: true });
    const journalPath = path.join(olderMigrations, 'meta/_journal.json');
    const journal = JSON.parse(fsSync.readFileSync(journalPath, 'utf8'));
    const latest = journal.entries.length;
    journal.entries = journal.entries.slice(0, -2);
    fsSync.writeFileSync(journalPath, JSON.stringify(journal));
    const older = new WorkspaceService(path.join(dir, 'older'), {
      migrationsPath: olderMigrations,
    });
    const original = await older.create({ name: 'Old', color: '#000000' });
    const folder = path.join(carried, 'old');
    await fs.cp(original.path, folder, { recursive: true });
    const count = (f: string) =>
      withDatabase(
        f,
        (sqlite) =>
          (sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number })
            .n,
      );
    expect(count(folder)).toBe(latest - 2);

    const info = await here.import(folder);

    expect(count(info.path)).toBe(latest);
    // the chosen folder is never migrated
    expect(count(folder)).toBe(latest - 2);
  });
});

describe('WorkspaceService.import — errors', () => {
  async function expectImportError(folder: string, reason: string): Promise<void> {
    const error = await here.import(folder).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceImportError);
    expect(error).toMatchObject({ code: 'workspace_import', reason });
  }

  // nothing registered and nothing left behind in the DevBrain folder
  async function expectNothingAdded(): Promise<void> {
    expect(registryIds(hereRoot)).toEqual([]);
    expect(await fs.readdir(path.join(hereRoot, 'workspaces'))).toEqual([]);
  }

  it('refuses a relative path', async () => {
    await expect(here.import('carried/x')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('refuses a folder without a workspace database', async () => {
    const empty = path.join(carried, 'empty');
    await fs.mkdir(empty);
    await expectImportError(empty, 'not_a_workspace');
    await expectNothingAdded();
  });

  it('refuses a path where there is nothing, or a file', async () => {
    await expectImportError(path.join(carried, 'nothing'), 'not_a_workspace');
    const file = path.join(carried, 'file.txt');
    await fs.writeFile(file, 'x');
    await expectImportError(file, 'not_a_workspace');
    await expectNothingAdded();
  });

  it('refuses a db.sqlite that is not SQLite, or not a workspace database', async () => {
    const text = path.join(carried, 'text');
    await fs.mkdir(text);
    await fs.writeFile(path.join(text, 'db.sqlite'), 'not a database at all, just some text');
    await expectImportError(text, 'not_a_workspace');

    const other = path.join(carried, 'other-app');
    await fs.mkdir(other);
    withDatabase(other, (sqlite) => sqlite.exec('CREATE TABLE things (id INTEGER)'));
    await expectImportError(other, 'not_a_workspace');
    await expectNothingAdded();
  });

  it('refuses a workspace already in the list by id', async () => {
    const { folder, original } = await carryWorkspace();
    await here.import(folder);
    const again = path.join(carried, 'again');
    await fs.cp(folder, again, { recursive: true });

    const error = await here.import(again).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'workspace_import',
      reason: 'already_added',
      workspaceId: original.id,
    });
    expect(registryIds(hereRoot)).toEqual([original.id]);
  });

  it('refuses a folder already in the list, even when its manifest names another id', async () => {
    const existing = await here.create({ name: 'Mine', color: '#000000' });
    writeManifest(existing.path, { ...existing, id: 'wsp_other' as WorkspaceId });

    const error = await here.import(existing.path).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: 'already_added', workspaceId: existing.id });
    // the registered folder is untouched
    expect(fsSync.existsSync(path.join(existing.path, 'db.sqlite'))).toBe(true);
  });

  it('refuses when workspaces/<id> is taken by a folder not in the list', async () => {
    const { folder, original } = await carryWorkspace();
    const taken = path.join(hereRoot, 'workspaces', original.id);
    await fs.mkdir(taken);
    await fs.writeFile(path.join(taken, 'keep.txt'), 'mine');

    await expect(here.import(folder)).rejects.toBeInstanceOf(FileExistsError);
    expect(await fs.readFile(path.join(taken, 'keep.txt'), 'utf8')).toBe('mine');
    expect(registryIds(hereRoot)).toEqual([]);
  });

  it('refuses a database from a newer DevBrain, removing the copy', async () => {
    const { folder } = await carryWorkspace();
    withDatabase(folder, (sqlite) =>
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run('from-the-future', Date.now() + 365 * 24 * 3600 * 1000),
    );

    const error = await here.import(folder).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkspaceTooNewError);
    expect(error).toMatchObject({ code: 'workspace_too_new' });
    await expectNothingAdded();
  });

  it('refuses a folder it may not read', async () => {
    const { folder } = await carryWorkspace();
    const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'access').mockRejectedValue(denied);

    await expectImportError(folder, 'unreadable');
    await expectNothingAdded();
  });
});

describe('WorkspaceService.import — integrations', () => {
  function addIntegration(folder: string, blob: Buffer, status = IntegrationStatus.CONNECTED) {
    return withDatabase(
      folder,
      (sqlite) =>
        drizzle({ client: sqlite, casing: 'snake_case' })
          .insert(integrations)
          .values({
            provider: Provider.LINEAR,
            authType: AuthType.API_KEY,
            accountId: `org:${Math.random()}`,
            accountLabel: 'Ada, Acme',
            status,
            credentials: blob,
          })
          .returning()
          .get().id,
    );
  }

  function statusOf(folder: string, id: string) {
    return withDatabase(
      folder,
      (sqlite) =>
        drizzle({ client: sqlite, casing: 'snake_case' })
          .select({ status: integrations.status })
          .from(integrations)
          .where(eq(integrations.id, id as never))
          .get()!.status,
    );
  }

  const apiKey = JSON.stringify({ type: AuthType.API_KEY, apiKey: 'lin_api_secret' });

  it('moves integrations whose credentials were encrypted elsewhere to needs_reauth', async () => {
    const { folder } = await carryWorkspace();
    const foreign = addIntegration(folder, await thereCipher.encrypt(apiKey));
    const readable = addIntegration(folder, await hereCipher.encrypt(apiKey));
    const disabled = addIntegration(
      folder,
      await thereCipher.encrypt(apiKey),
      IntegrationStatus.DISABLED,
    );

    const info = await here.import(folder);

    expect(statusOf(info.path, foreign)).toBe(IntegrationStatus.NEEDS_REAUTH);
    expect(statusOf(info.path, readable)).toBe(IntegrationStatus.CONNECTED);
    // a disabled one stays disabled; enabling it asks for sign-in then
    expect(statusOf(info.path, disabled)).toBe(IntegrationStatus.DISABLED);
    // the chosen folder keeps what it had
    expect(statusOf(folder, foreign)).toBe(IntegrationStatus.CONNECTED);

    const workspace = await here.open(info.id);
    expect(workspace.integrations.getById(foreign as never).status).toBe(
      IntegrationStatus.NEEDS_REAUTH,
    );
  });

  it('with no cipher configured, every connected integration needs sign-in', async () => {
    const plain = new WorkspaceService(path.join(dir, 'plain'), WORKSPACE_OPTIONS);
    const { folder } = await carryWorkspace();
    const id = addIntegration(folder, await thereCipher.encrypt(apiKey));

    const info = await plain.import(folder);

    expect(statusOf(info.path, id)).toBe(IntegrationStatus.NEEDS_REAUTH);
  });
});

describe('workspace manifest', () => {
  it('is written on create and read back as the same name, colour, id and creation time', async () => {
    const info = await here.create({ name: 'Personal', color: '#ec4899' });
    const raw = JSON.parse(await fs.readFile(path.join(info.path, MANIFEST_FILE), 'utf8'));
    expect(raw).toEqual({
      version: 1,
      id: info.id,
      name: 'Personal',
      color: '#ec4899',
      createdAt: info.createdAt,
    });
    expect(readManifest(info.path)).toEqual({
      id: info.id,
      name: 'Personal',
      color: '#ec4899',
      createdAt: info.createdAt,
    });
  });

  it('is the only place the name, colour and creation time are kept', async () => {
    const info = await here.create({ name: 'Personal', color: '#ec4899' });
    await here.open(info.id);

    const registry = JSON.parse(await fs.readFile(path.join(hereRoot, REGISTRY_FILE), 'utf8'));
    expect(Object.keys(registry[info.id]).sort()).toEqual(['id', 'lastOpenedAt', 'path']);
    // edited in the folder, the name changes everywhere
    writeManifest(info.path, { ...info, name: 'Edited' });
    expect(here.getById(info.id).name).toBe('Edited');
  });

  it('lists a workspace whose manifest is gone as recovered, grey, dated by its database', async () => {
    const info = await here.create({ name: 'Lost', color: '#ec4899' });
    await fs.rm(path.join(info.path, MANIFEST_FILE));

    const listed = here.getById(info.id);
    expect(listed).toMatchObject({ name: `Recovered workspace ${info.id}`, color: '#808080' });
    expect(listed.createdAt).toBeGreaterThan(0);
  });

  it("ignores a manifest that names another workspace's id", async () => {
    const info = await here.create({ name: 'Mine', color: '#000000' });
    writeManifest(info.path, { ...info, id: 'wsp_someone_else' as WorkspaceId, name: 'Theirs' });
    expect(here.getById(info.id).name).toBe(`Recovered workspace ${info.id}`);
  });

  describe('a workspaces.json from before manifests', () => {
    // what an older DevBrain wrote: every detail in the registry, no manifest in the folder
    async function olderRegistry(service = here, root = hereRoot) {
      const kept = await service.create({ name: 'Unused', color: '#000000' });
      await fs.rm(path.join(kept.path, MANIFEST_FILE));
      const gone = path.join(root, 'workspaces', 'wsp_gone');
      const registry = {
        [kept.id]: { ...kept, name: 'Work', color: '#22c55e', createdAt: 1_700_000_000_000 },
        wsp_gone: {
          id: 'wsp_gone',
          name: 'Gone',
          color: '#ef4444',
          path: gone,
          createdAt: 1_600_000_000_000,
          lastOpenedAt: null,
        },
      };
      await fs.writeFile(path.join(root, REGISTRY_FILE), JSON.stringify(registry));
      return { id: kept.id, folder: kept.path, registry };
    }

    it('still lists each workspace with its details before they are moved', async () => {
      const { id } = await olderRegistry();
      expect(here.getById(id)).toMatchObject({ name: 'Work', color: '#22c55e' });
    });

    it('moves them into each folder and drops them from the registry, once, at start', async () => {
      // a whole DevBrain folder, as DevBrain.open checks it
      const root = path.join(dir, 'brain');
      await scaffoldDevBrain(root);
      const service = new WorkspaceService(root, WORKSPACE_OPTIONS);
      const { id, folder } = await olderRegistry(service, root);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const devBrain = await DevBrain.open({
        path: root,
        settingsStore: openMemorySettingsStore,
        workspace: WORKSPACE_OPTIONS,
      });
      await devBrain.close();

      expect(readManifest(folder)).toEqual({
        id,
        name: 'Work',
        color: '#22c55e',
        createdAt: 1_700_000_000_000,
      });
      const registry = JSON.parse(await fs.readFile(path.join(root, REGISTRY_FILE), 'utf8'));
      expect(registry[id]).toEqual({ id, path: folder, lastOpenedAt: null });
      // a folder that is gone keeps its details in the registry, so nothing is lost, and quietly
      expect(registry.wsp_gone).toMatchObject({ name: 'Gone', color: '#ef4444' });
      expect(console.warn).not.toHaveBeenCalled();
      expect(service.getById(id)).toMatchObject({ name: 'Work', createdAt: 1_700_000_000_000 });
    });

    it('keeps a manifest already in the folder, which wins over the registry', async () => {
      const { id, folder } = await olderRegistry();
      writeManifest(folder, { id, name: 'From the folder', color: '#000000', createdAt: 1 });

      expect(moveDetailsToManifests(hereRoot)).toEqual([id]);
      expect(readManifest(folder)?.name).toBe('From the folder');
    });
  });

  it('reads as null when missing, invalid JSON, or another version', async () => {
    const folder = path.join(carried, 'm');
    await fs.mkdir(folder);
    expect(readManifest(folder)).toBeNull();
    await fs.writeFile(path.join(folder, MANIFEST_FILE), '{');
    expect(readManifest(folder)).toBeNull();
    await fs.writeFile(
      path.join(folder, MANIFEST_FILE),
      JSON.stringify({ version: 2, id: 'wsp_x', name: 'X', color: '#000', createdAt: 1 }),
    );
    expect(readManifest(folder)).toBeNull();
  });

  it('gives a registry rebuilt from the directories its names and colours', async () => {
    const info = await here.create({ name: 'Work', color: '#22c55e' });
    await fs.rm(path.join(hereRoot, REGISTRY_FILE));
    await fs.rm(path.join(hereRoot, REGISTRY_BACKUP_FILE));

    await recoverRegistry(hereRoot, () => {});

    expect(here.getById(info.id)).toMatchObject({
      name: 'Work',
      color: '#22c55e',
      createdAt: info.createdAt,
    });
  });
});

describe('opening a workspace a newer DevBrain migrated', () => {
  it('refuses it without changing the database', async () => {
    const info = await here.create({ name: 'Shared', color: '#000000' });
    const future = Date.now() + 365 * 24 * 3600 * 1000;
    withDatabase(info.path, (sqlite) =>
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run('from-the-future', future),
    );

    await expect(here.open(info.id)).rejects.toBeInstanceOf(WorkspaceTooNewError);
    expect(here.currentWorkspace).toBeNull();
  });
});
