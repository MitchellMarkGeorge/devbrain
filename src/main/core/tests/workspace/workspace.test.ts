import { createGoogleCalendarProvider } from '../../integrations/providers/google-calendar';
import { deferred } from '../utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo, WorkspaceOptions } from '../../workspace/types';
import { Workspace } from '../../workspace/workspace';
import {
  IntegrationAuthError,
  UnsafeUrlError,
  WorkspaceClosedError,
  WorkspaceMigrationError,
} from '../../shared/errors';
import { migrationsWithExtra } from '../utils';
import Database from 'better-sqlite3';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { createFakeProvider, FAKE_API_KEY, fakeRegistry } from '../sync/fake-provider';
import { AuthType, IntegrationStatus, LinkState, Provider } from '../../integrations/types';
import type { TaskLinkChange } from '../../integrations/detach';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { scriptedFetch } from '../integrations/linear/fake-fetch';
import viewerFixture from '../integrations/fixtures/linear/viewer.json';

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);
const OPTIONS: WorkspaceOptions = { migrationsPath: MIGRATIONS_PATH };

const makeInfo = (
  workspacePath: string,
  overrides: Partial<WorkspaceInfo> = {},
): WorkspaceInfo => ({
  id: 'wsp_test001' as WorkspaceId,
  name: 'Test Workspace',
  color: '#000000',
  path: workspacePath,
  createdAt: Date.now(),
  lastOpenedAt: null,
  ...overrides,
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-workspace-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe('Workspace.create', () => {
  it('creates a db.sqlite file in the workspace directory', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    await workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.isFile()).toBe(true);
  });

  it('creates a non-empty db.sqlite file (migrations have run)', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    await workspace.close();
    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('exposes the provided workspace info', async () => {
    const info = makeInfo(tmpDir);
    const workspace = await Workspace.create(info, OPTIONS);
    expect(workspace.info).toBe(info);
    await workspace.close();
  });

  it('preserves all info fields on the info property', async () => {
    const info = makeInfo(tmpDir, {
      id: 'wsp_custom1' as WorkspaceId,
      name: 'Custom Name',
      color: '#ff0000',
      lastOpenedAt: 1_700_000_000_000,
    });
    const workspace = await Workspace.create(info, OPTIONS);
    expect(workspace.info.id).toBe('wsp_custom1');
    expect(workspace.info.name).toBe('Custom Name');
    expect(workspace.info.color).toBe('#ff0000');
    expect(workspace.info.lastOpenedAt).toBe(1_700_000_000_000);
    await workspace.close();
  });

  it('throws when a database already exists at the workspace path', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info, OPTIONS);
    await first.close();
    await expect(Workspace.create(info, OPTIONS)).rejects.toThrow(/already exists/);
  });
});

describe('Workspace.open', () => {
  it('opens an existing workspace', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    const opened = await Workspace.open(info, OPTIONS);
    expect(opened.info).toMatchObject({ id: info.id, name: info.name });
    await opened.close();
  });

  it('preserves all info fields when opening', async () => {
    const info = makeInfo(tmpDir, {
      id: 'wsp_opentest' as WorkspaceId,
      name: 'Open Test',
      color: '#00ff00',
    });
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    const opened = await Workspace.open(info, OPTIONS);
    expect(opened.info.id).toBe('wsp_opentest');
    expect(opened.info.name).toBe('Open Test');
    expect(opened.info.color).toBe('#00ff00');
    await opened.close();
  });

  it('creates a db.sqlite.backup file on open', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    const opened = await Workspace.open(info, OPTIONS);
    await opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.isFile()).toBe(true);
  });

  it('backup file is non-empty', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    const opened = await Workspace.open(info, OPTIONS);
    await opened.close();

    const stat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('overwrites an existing backup on repeated opens', async () => {
    const info = makeInfo(tmpDir);
    const first = await Workspace.create(info, OPTIONS);
    await first.close();

    // First open creates the backup
    const second = await Workspace.open(info, OPTIONS);
    await second.close();

    const firstBackupStat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    const firstBackupMtime = firstBackupStat.mtimeMs;

    // Small delay to ensure mtime would differ if re-created
    await new Promise((r) => setTimeout(r, 10));

    // Second open should overwrite the backup without throwing
    const third = await Workspace.open(info, OPTIONS);
    await third.close();

    await expect(fs.stat(path.join(tmpDir, 'db.sqlite.backup'))).resolves.toBeDefined();
    // mtime should be updated (or at worst equal) — just confirm no throw
    const secondBackupStat = await fs.stat(path.join(tmpDir, 'db.sqlite.backup'));
    expect(secondBackupStat.mtimeMs).toBeGreaterThanOrEqual(firstBackupMtime);
  });

  it('throws when no database exists at the workspace path', async () => {
    await expect(Workspace.open(makeInfo(tmpDir), OPTIONS)).rejects.toMatchObject({
      code: 'workspace_data_missing',
      message: expect.stringMatching(/No workspace database found/),
    });
  });

  it('a created-then-closed workspace can be re-opened', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    const opened = await Workspace.open(info, OPTIONS);
    expect(opened.info.id).toBe(info.id);
    await opened.close();
  });
});

describe('Workspace.close', () => {
  it('closes the SQLite connection without throwing', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    await expect(workspace.close()).resolves.toBeUndefined();
  });

  it('calling close() a second time does not throw', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    await workspace.close();
    // better-sqlite3 silently no-ops on double-close
    await expect(workspace.close()).resolves.toBeUndefined();
  });
});

describe('Workspace — WAL', () => {
  function journalMode(dbPath: string): string {
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      return sqlite.pragma('journal_mode', { simple: true }) as string;
    } finally {
      sqlite.close();
    }
  }

  it('creates and opens the database in WAL mode', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();
    expect(journalMode(path.join(tmpDir, 'db.sqlite'))).toBe('wal');

    const opened = await Workspace.open(info, OPTIONS);
    await opened.close();
    expect(journalMode(path.join(tmpDir, 'db.sqlite'))).toBe('wal');
  });

  it('the backup taken on open includes writes still in the WAL', async () => {
    const info = makeInfo(tmpDir);
    const created = await Workspace.create(info, OPTIONS);
    await created.close();

    // another connection writes and stays open, so its write is in the WAL, not the main file
    const dbPath = path.join(tmpDir, 'db.sqlite');
    const writer = new Database(dbPath);
    try {
      writer
        .prepare(`INSERT INTO projects (id, title, due_date) VALUES ('prj_inwal', 'In WAL', 0)`)
        .run();
      expect((await fs.stat(`${dbPath}-wal`)).size).toBeGreaterThan(0);

      const opened = await Workspace.open(info, OPTIONS);
      await opened.close();
    } finally {
      writer.close();
    }

    const backup = new Database(path.join(tmpDir, 'db.sqlite.backup'), { readonly: true });
    try {
      expect(backup.prepare(`SELECT title FROM projects`).pluck().all()).toEqual(['In WAL']);
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      backup.close();
    }
  });
});

describe('Workspace.close — sync', () => {
  it('closing mid-sync waits for the run, writes nothing and does not throw', async () => {
    const info = makeInfo(tmpDir);
    const provider = createFakeProvider();
    const options = { ...OPTIONS, cipher: new FakeCipher(), providers: fakeRegistry(provider) };
    const workspace = await Workspace.create(info, options);
    workspace.sync.start();

    // connecting starts the initial sync; the provider answers after the close has begun
    let pullStartedAt = 0;
    provider.tasks.script({
      tasks: [issue()],
      delayMs: 50,
      onPull: () => {
        pullStartedAt = performance.now();
      },
    });
    await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(provider.tasks.pulls).toHaveLength(1);

    await expect(workspace.close()).resolves.toBeUndefined();
    // close waited for the pull to answer before closing SQLite
    expect(performance.now() - pullStartedAt).toBeGreaterThanOrEqual(45);
    // anything still running would have thrown "database is closed" by now
    await new Promise((resolve) => setTimeout(resolve, 100));

    const reopened = await Workspace.open(info, options);
    try {
      expect(reopened.tasks.listTasks().items).toEqual([]);
      const [integration] = reopened.integrations.list();
      expect(integration.sources[0]).toMatchObject({ lastSyncedAt: null, lastError: null });
    } finally {
      await reopened.close();
    }
  });

  it('closing while Linear is not answering cancels the request and returns at once', async () => {
    const info = makeInfo(tmpDir);
    // connecting reads the viewer; the sync it starts then waits on a request that never answers
    const fetch = scriptedFetch([{ body: viewerFixture }, { hang: true }]);
    const workspace = await Workspace.create(info, { ...OPTIONS, cipher: new FakeCipher(), fetch });
    workspace.sync.start();
    await workspace.integrations.connectWithApiKey(Provider.LINEAR, 'lin_api_test');
    await vi.waitFor(() => expect(fetch.requests).toHaveLength(2));

    const startedAt = performance.now();
    await workspace.close();

    // without the run's signal on the request, close would wait out the 30-second timeout
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(fetch.requests[1].signal?.aborted).toBe(true);
  });

  it('closing an idle started workspace leaves no timers behind', async () => {
    vi.useFakeTimers();
    try {
      const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
      workspace.sync.start();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await workspace.close();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Workspace — disconnect', () => {
  it('drops the items a disconnect deleted from search', async () => {
    const provider = createFakeProvider();
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher: new FakeCipher(),
      providers: fakeRegistry(provider),
    });
    try {
      workspace.sync.start();
      provider.tasks.script({ tasks: [issue()] });
      const integration = await workspace.integrations.connectWithApiKey(
        Provider.LINEAR,
        FAKE_API_KEY,
      );
      const search = () => workspace.search.search({ query: 'Issue', entityType: ['task'] });
      await vi.waitFor(() => expect(search()).toHaveLength(1));

      await workspace.integrations.disconnect(integration.id, { keepLocalCopies: false });

      expect(search()).toEqual([]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace — detach', () => {
  it('detaches, renames and reattaches a task, keeping search up to date', async () => {
    const provider = createFakeProvider();
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher: new FakeCipher(),
      providers: fakeRegistry(provider),
    });
    try {
      workspace.sync.start();
      const item = issue();
      provider.tasks.script({ tasks: [item] });
      await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
      const search = (query: string) =>
        workspace.search.search({ query, entityType: ['task'] }).map(({ entityId }) => entityId);
      await vi.waitFor(() => expect(search('Issue')).toHaveLength(1));
      const [{ id }] = workspace.tasks.listTasks().items;
      const changes: TaskLinkChange[] = [];
      workspace.detach.onChange((change) => changes.push(change));

      const detached = workspace.detach.detachTask(id);
      workspace.tasks.updateTask(id, { title: 'Mine' });

      expect(detached.external?.state).toBe(LinkState.DETACHED);
      expect(search('Mine')).toEqual([id]);
      expect(search('Issue')).toEqual([]);

      provider.tasks.respondToLookup = () => ({ tasks: [{ ...item, title: 'Issue renamed' }] });
      const reattached = await workspace.detach.reattachTask(id);

      // Linear's copy overwrites the local one, in the index too
      expect(reattached).toMatchObject({ title: 'Issue renamed', external: { state: 'synced' } });
      expect(search('renamed')).toEqual([id]);
      expect(search('Mine')).toEqual([]);
      expect(changes.map((change) => change.type)).toEqual(['detached', 'reattached']);
    } finally {
      await workspace.close();
    }
  });

  it('moves the integration to needs_reauth when Linear rejects a reattach, aborting its runs', async () => {
    const provider = createFakeProvider();
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher: new FakeCipher(),
      providers: fakeRegistry(provider),
    });
    try {
      workspace.sync.start();
      provider.tasks.script({ tasks: [issue()] });
      const integration = await workspace.integrations.connectWithApiKey(
        Provider.LINEAR,
        FAKE_API_KEY,
      );
      const search = (query: string) =>
        workspace.search.search({ query, entityType: ['task'] }).map(({ entityId }) => entityId);
      await vi.waitFor(() => expect(search('Issue')).toHaveLength(1));
      const [{ id }] = workspace.tasks.listTasks().items;
      workspace.detach.detachTask(id);
      provider.tasks.respondToLookup = () => {
        throw new IntegrationAuthError('Linear rejected the credentials');
      };

      // a run is waiting on Linear when the reattach is rejected
      const pulling = deferred<void>();
      provider.tasks.script({
        tasks: [{ ...issue(), externalId: 'issue-2', key: 'ENG-2', title: 'Late' }],
        delayMs: 50,
        onPull: () => pulling.resolve(),
      });
      const run = workspace.sync.syncNow(integration.sources[0].id);
      await pulling.promise;

      await expect(workspace.detach.reattachTask(id)).rejects.toThrow(IntegrationAuthError);

      const [stored] = workspace.integrations.list();
      expect(stored.status).toBe(IntegrationStatus.NEEDS_REAUTH);
      expect(workspace.tasks.getById(id).external?.state).toBe(LinkState.DETACHED);
      // the run was aborted, so the page it was waiting on is never written
      await run;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(search('Late')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace — search', () => {
  it("indexes the user's own tasks, projects and notes as they are written", async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const search = (query: string) =>
        workspace.search
          .search({ query, entityType: ['task', 'project', 'note'] })
          .map(({ entityId }) => entityId);

      const project = workspace.projects.createProject({
        title: 'Apollo',
        dueDate: new Date(),
      });
      const task = workspace.tasks.createTask({ title: 'Draft', dueDate: new Date() });
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      expect(search('Minutes')).toEqual([note.id]);
      expect(search('Apollo')).toEqual([project.id]);
      expect(search('Draft')).toEqual([task.id]);

      workspace.projects.updateProject(project.id, { description: 'lunar' });
      workspace.tasks.updateTask(task.id, { title: 'Final' });
      await workspace.notes.updateNoteContent(note.id, 'first');
      await workspace.notes.updateNoteContent(note.id, 'second **bold**');
      workspace.notes.updateNote(note.id, { title: 'Agenda' });

      expect(search('lunar')).toEqual([project.id]);
      expect(search('Final')).toEqual([task.id]);
      expect(search('Draft')).toEqual([]);
      // the last content wins, and a rename keeps it
      expect(search('second')).toEqual([note.id]);
      expect(search('first')).toEqual([]);
      expect(search('Agenda')).toEqual([note.id]);
      expect(search('Minutes')).toEqual([]);
      expect(workspace.search.search({ query: 'bold', entityType: ['note'] })).toMatchObject([
        { body: 'second <b>bold</b>' },
      ]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace — concurrent note saves', () => {
  it('indexes the last of many parallel saves to one note', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      const words = Array.from({ length: 20 }, (_, i) => `word${String(i).padStart(2, '0')}`);

      await Promise.all(words.map((w) => workspace.notes.updateNoteContent(note.id, w)));

      const search = (query: string) =>
        workspace.search.search({ query, entityType: ['note'] }).map(({ entityId }) => entityId);
      const last = words[words.length - 1];
      expect(search(last)).toEqual([note.id]);
      for (const w of words.slice(0, -1)) expect(search(w)).toEqual([]);
      expect(workspace.notes.getById(note.id).preview).toBe(last);
    } finally {
      await workspace.close();
    }
  });
});

// the ids the search finds for `query`, across every entity type, sorted
function searchIds(workspace: Workspace, query: string) {
  return workspace.search
    .search({ query, entityType: ['task', 'project', 'note', 'event'] })
    .map(({ entityId }) => entityId)
    .sort();
}

describe('Workspace — search of events', () => {
  it('indexes local events as they are created and updated, and drops them when deleted', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const startAt = new Date('2026-06-10T10:00:00.000Z');
      const endAt = new Date('2026-06-10T11:00:00.000Z');
      const event = workspace.events.createEvent({
        title: 'Standup',
        description: 'daily sync',
        startAt,
        endAt,
      });
      const other = workspace.events.createEvent({ title: 'Standup two', startAt, endAt });
      expect(searchIds(workspace, 'Standup')).toEqual([event.id, other.id].sort());
      expect(searchIds(workspace, 'daily')).toEqual([event.id]);

      workspace.events.updateEvent(event.id, { title: 'Retro', description: 'monthly' });
      expect(searchIds(workspace, 'Retro')).toEqual([event.id]);
      expect(searchIds(workspace, 'monthly')).toEqual([event.id]);
      expect(searchIds(workspace, 'daily')).toEqual([]);
      expect(searchIds(workspace, 'Standup')).toEqual([other.id]);

      workspace.events.deleteEvent(event.id);
      expect(searchIds(workspace, 'Retro')).toEqual([]);
      expect(searchIds(workspace, 'Standup')).toEqual([other.id]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace — permanent delete', () => {
  it('keeps a deleted task and its subtasks out of search, and unlinks its task note', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const dueDate = new Date('2026-12-01T00:00:00Z');
      const task = workspace.tasks.createTask({ title: 'Doomed parent', dueDate });
      const sub = workspace.tasks.createSubtask(task.id, { title: 'Doomed child' });
      const kept = workspace.tasks.createTask({ title: 'Doomed survivor', dueDate });
      const note = await workspace.notes.createNote({ title: 'Notes', linkedTaskId: task.id });
      expect(searchIds(workspace, 'Doomed')).toEqual([task.id, sub.id, kept.id].sort());
      // deleting is only from the trash
      expect(() => workspace.tasks.deleteTask(task.id)).toThrow(/not archived/);
      workspace.archive.archiveTask(task.id);

      workspace.tasks.deleteTask(task.id);
      await workspace.search.rebuild();

      expect(searchIds(workspace, 'Doomed')).toEqual([kept.id]);
      // the workspace's connection enforces foreign keys: the note's link was set null; it went to
      // the trash with the task and comes back on its own
      workspace.archive.restoreNote(note.id);
      expect(workspace.notes.getById(note.id).linkedTaskId).toBeNull();
    } finally {
      await workspace.close();
    }
  });

  it('keeps a deleted project out of search; its tasks come back from the trash without it', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const dueDate = new Date('2026-12-01T00:00:00Z');
      const project = workspace.projects.createProject({ title: 'Doomed project', dueDate });
      const task = workspace.tasks.createTask({
        title: 'Doomed task',
        dueDate,
        projectId: project.id,
      });

      workspace.archive.archiveProject(project.id);

      workspace.projects.deleteProject(project.id);
      workspace.archive.restoreTask(task.id);

      expect(searchIds(workspace, 'Doomed')).toEqual([task.id]);
      expect(workspace.tasks.getById(task.id).projectId).toBeNull();
    } finally {
      await workspace.close();
    }
  });

  it('keeps a deleted note out of search and removes its file', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Doomed note' });
      await workspace.notes.updateNoteContent(note.id, 'secret body');
      expect(searchIds(workspace, 'secret')).toEqual([note.id]);
      workspace.archive.archiveNote(note.id);

      await workspace.notes.deleteNote(note.id);

      expect(searchIds(workspace, 'secret')).toEqual([]);
      expect(searchIds(workspace, 'Doomed')).toEqual([]);
      expect(await fs.readdir(path.join(tmpDir, 'notes'))).toEqual([]);
      // a rebuild finds nothing of them either
      await workspace.search.rebuild();
      expect(searchIds(workspace, 'Doomed')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });

  it("deletes only the user's copy of a detached Linear task; sync brings the issue back as new", async () => {
    const provider = createFakeProvider();
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher: new FakeCipher(),
      providers: fakeRegistry(provider),
    });
    try {
      workspace.sync.start();
      const item = issue();
      provider.tasks.script({ tasks: [item] });
      const integration = await workspace.integrations.connectWithApiKey(
        Provider.LINEAR,
        FAKE_API_KEY,
      );
      const sourceId = integration.sources[0].id;
      await vi.waitFor(() => expect(workspace.tasks.listTasks().items).toHaveLength(1));
      const [{ id }] = workspace.tasks.listTasks().items;

      // a synced task can't be put in the trash; detached, it can
      expect(() => workspace.archive.archiveTask(id)).toThrow(/read-only/);
      workspace.detach.detachTask(id);
      workspace.archive.archiveTask(id);
      workspace.tasks.deleteTask(id);

      // still assigned, and edited in Linear since
      const updatedAt = new Date('2026-10-02T12:00:00Z');
      const fresh = { ...item, externalId: 'issue-2', key: 'ENG-2', title: 'Fresh', updatedAt };
      provider.tasks.script({ tasks: [{ ...item, title: 'Edited', updatedAt }, fresh] });
      await workspace.sync.syncNow(sourceId);

      const titles = workspace.tasks.listTasks().items.map((task) => task.title);
      expect(titles.sort()).toEqual(['Edited', 'Fresh']);
      const [edited] = workspace.tasks.listTasks().items.filter((task) => task.title === 'Edited');
      expect(edited.id).not.toBe(id);
      expect(edited.external?.state).toBe(LinkState.SYNCED);
      expect(searchIds(workspace, 'Edited')).toEqual([edited.id]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace — search of archived and restored rows', () => {
  it('archiving drops a project, its tasks and their notes; restoring brings them back', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const project = workspace.projects.createProject({
        title: 'Apollo',
        dueDate: new Date(),
      });
      const task = workspace.tasks.createTask({
        title: 'Apollo launch',
        dueDate: new Date(),
        projectId: project.id,
      });
      const subtask = workspace.tasks.createSubtask(task.id, { title: 'Apollo fuel' });
      const projectNote = await workspace.notes.createNote({
        title: 'Apollo plan',
        projectId: project.id,
      });
      const taskNote = await workspace.notes.createNote({
        title: 'Log',
        linkedTaskId: subtask.id,
      });
      await workspace.notes.updateNoteContent(taskNote.id, 'Apollo **telemetry**');
      const other = workspace.tasks.createTask({
        title: 'Apollo other',
        dueDate: new Date(),
      });
      const all = [project.id, task.id, subtask.id, projectNote.id, taskNote.id, other.id].sort();
      expect(searchIds(workspace, 'Apollo')).toEqual(all);

      workspace.archive.archiveProject(project.id);
      expect(searchIds(workspace, 'Apollo')).toEqual([other.id]);
      expect(searchIds(workspace, 'telemetry')).toEqual([]);

      workspace.archive.restoreProject(project.id);
      // tasks and projects are back at once; notes once their files are read
      expect(searchIds(workspace, 'Apollo')).toEqual(
        [project.id, task.id, subtask.id, other.id].sort(),
      );
      await vi.waitFor(() => expect(searchIds(workspace, 'Apollo')).toEqual(all));
      expect(searchIds(workspace, 'telemetry')).toEqual([taskNote.id]);
    } finally {
      await workspace.close();
    }
  });

  it('archiving drops a task, its subtree and their notes; restoring brings them back', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const task = workspace.tasks.createTask({ title: 'Draft', dueDate: new Date() });
      const subtask = workspace.tasks.createSubtask(task.id, { title: 'Draft intro' });
      const note = await workspace.notes.createNote({
        title: 'Draft notes',
        linkedTaskId: subtask.id,
      });
      const other = workspace.tasks.createTask({ title: 'Draft other', dueDate: new Date() });
      const all = [task.id, subtask.id, note.id, other.id].sort();
      expect(searchIds(workspace, 'Draft')).toEqual(all);

      workspace.archive.archiveTask(task.id);
      expect(searchIds(workspace, 'Draft')).toEqual([other.id]);

      workspace.archive.restoreTask(task.id);
      expect(searchIds(workspace, 'Draft')).toEqual([task.id, subtask.id, other.id].sort());
      await vi.waitFor(() => expect(searchIds(workspace, 'Draft')).toEqual(all));
    } finally {
      await workspace.close();
    }
  });

  it('archiving and restoring a note re-indexes its content from its file', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      await workspace.notes.updateNoteContent(note.id, 'quarterly');
      // renamed after the file was written: the restored entry takes the row's title
      workspace.notes.updateNote(note.id, { title: 'Agenda' });
      expect(searchIds(workspace, 'quarterly')).toEqual([note.id]);

      workspace.archive.archiveNote(note.id);
      expect(searchIds(workspace, 'quarterly')).toEqual([]);
      expect(searchIds(workspace, 'Agenda')).toEqual([]);

      workspace.archive.restoreNote(note.id);
      await vi.waitFor(() => expect(searchIds(workspace, 'quarterly')).toEqual([note.id]));
      expect(searchIds(workspace, 'Agenda')).toEqual([note.id]);
      expect(searchIds(workspace, 'Minutes')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });

  it('a write to an archived task or project leaves it out of search', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const project = workspace.projects.createProject({
        title: 'Apollo',
        dueDate: new Date(),
      });
      const task = workspace.tasks.createTask({ title: 'Draft', dueDate: new Date() });
      workspace.archive.archiveProject(project.id);
      workspace.archive.archiveTask(task.id);

      workspace.projects.updateProject(project.id, { description: 'lunar' });
      workspace.tasks.updateTask(task.id, { description: 'lunar' });

      expect(searchIds(workspace, 'lunar')).toEqual([]);
      workspace.archive.restoreProject(project.id);
      workspace.archive.restoreTask(task.id);
      expect(searchIds(workspace, 'lunar')).toEqual([project.id, task.id].sort());
    } finally {
      await workspace.close();
    }
  });

  it('a note archived again while its restore is read stays out of search', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      workspace.archive.archiveNote(note.id);

      workspace.archive.restoreNote(note.id);
      workspace.archive.archiveNote(note.id);
      await workspace.close();

      const reopened = await Workspace.open(makeInfo(tmpDir), OPTIONS);
      try {
        expect(searchIds(reopened, 'Minutes')).toEqual([]);
      } finally {
        await reopened.close();
      }
    } finally {
      await workspace.close();
    }
  });

  it('a content write while a restored note is read keeps its newer content', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      await workspace.notes.updateNoteContent(note.id, 'older');

      // the file holds "older"; an edit indexed before the read finishes is newer than it
      const indexing = workspace.search.indexNoteFiles([note.id]);
      workspace.search.indexNoteContent(note, 'newer');
      await indexing;

      expect(searchIds(workspace, 'newer')).toEqual([note.id]);
      expect(searchIds(workspace, 'older')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });

  it('closing waits for restored notes to be indexed', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    const note = await workspace.notes.createNote({ title: 'Minutes' });
    workspace.archive.archiveNote(note.id);
    workspace.archive.restoreNote(note.id);
    await workspace.close();

    const reopened = await Workspace.open(makeInfo(tmpDir), OPTIONS);
    try {
      expect(searchIds(reopened, 'Minutes')).toEqual([note.id]);
    } finally {
      await reopened.close();
    }
  });

  it("writes search in the archive's transaction", async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    // private, but it is the connection the archive's transaction runs on
    const sqlite = workspace['sqliteClient'];
    // recorded rather than asserted in the spies: a listener's error is logged, not thrown
    const calls: [string, boolean][] = [];
    const removed = vi
      .spyOn(workspace.search, 'removeFromIndex')
      .mockImplementation(() => void calls.push(['remove', sqlite.inTransaction]));
    const indexed = vi
      .spyOn(workspace.search, 'indexTasks')
      .mockImplementation(() => void calls.push(['index', sqlite.inTransaction]));
    try {
      const task = workspace.tasks.createTask({ title: 'Draft', dueDate: new Date() });
      calls.length = 0;

      workspace.archive.archiveTask(task.id);
      workspace.archive.restoreTask(task.id);

      expect(calls).toEqual([
        ['remove', true],
        ['index', true],
      ]);
      expect(removed).toHaveBeenCalledWith([task.id]);
      expect(indexed).toHaveBeenCalledWith([expect.objectContaining({ id: task.id })]);
    } finally {
      removed.mockRestore();
      indexed.mockRestore();
      await workspace.close();
    }
  });
});

describe('Workspace — search rebuild', () => {
  it('rebuilds a drifted index from the current rows and note files', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const project = workspace.projects.createProject({
        title: 'Apollo',
        dueDate: new Date(),
      });
      const task = workspace.tasks.createTask({
        title: 'Apollo launch',
        description: 'countdown',
        dueDate: new Date(),
      });
      const note = await workspace.notes.createNote({ title: 'Apollo plan' });
      await workspace.notes.updateNoteContent(note.id, '# Trajectory\n\n**burn** at noon');
      const event = workspace.events.createEvent({
        title: 'Apollo review',
        startAt: new Date('2026-06-10T10:00:00.000Z'),
        endAt: new Date('2026-06-10T11:00:00.000Z'),
      });
      const archivedTask = workspace.tasks.createTask({
        title: 'Apollo scrapped',
        dueDate: new Date(),
      });
      const archivedNote = await workspace.notes.createNote({ title: 'Apollo old' });
      workspace.archive.archiveTask(archivedTask.id);
      workspace.archive.archiveNote(archivedNote.id);
      const expected = [project.id, task.id, note.id, event.id].sort();
      expect(searchIds(workspace, 'Apollo')).toEqual(expected);

      // drift: entries lost, a stale one left behind, an archived row back in
      const sqlite = workspace['sqliteClient'];
      sqlite.prepare('DELETE FROM search_index WHERE entity_id IN (?, ?)').run(note.id, task.id);
      sqlite
        .prepare('UPDATE search_index SET title = ? WHERE entity_id = ?')
        .run('Gemini', project.id);
      sqlite
        .prepare(
          "INSERT INTO search_index (title, body, entity_id, entity_type) VALUES (?, '', ?, 'task')",
        )
        .run('Apollo scrapped', archivedTask.id);
      sqlite
        .prepare(
          "INSERT INTO search_index (title, body, entity_id, entity_type) VALUES ('Apollo ghost', '', 'task_gone', 'task')",
        )
        .run();

      const result = await workspace.search.rebuild();

      expect(result).toEqual({ indexed: 4, unreadableNoteIds: [] });
      expect(searchIds(workspace, 'Apollo')).toEqual(expected);
      expect(searchIds(workspace, 'Gemini')).toEqual([]);
      expect(searchIds(workspace, 'countdown')).toEqual([task.id]);
      expect(searchIds(workspace, 'burn')).toEqual([note.id]);
      expect(searchIds(workspace, 'Trajectory')).toEqual([note.id]);
    } finally {
      await workspace.close();
    }
  });

  it('reports a note whose file cannot be read and indexes the rest', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const lost = await workspace.notes.createNote({ title: 'Minutes lost' });
      const kept = await workspace.notes.createNote({ title: 'Minutes kept' });
      await fs.rm(path.join(tmpDir, 'notes', `${lost.id}.md`));

      const result = await workspace.search.rebuild();

      expect(result).toEqual({ indexed: 1, unreadableNoteIds: [lost.id] });
      expect(searchIds(workspace, 'Minutes')).toEqual([kept.id]);
    } finally {
      error.mockRestore();
      await workspace.close();
    }
  });

  it('keeps a note content write made while the files are read', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      await workspace.notes.updateNoteContent(note.id, 'older');

      const rebuilding = workspace.search.rebuild();
      workspace.search.indexNoteContent(note, 'newer');
      await rebuilding;

      expect(searchIds(workspace, 'newer')).toEqual([note.id]);
      expect(searchIds(workspace, 'older')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });

  it('closing waits for a rebuild still reading note files', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    const note = await workspace.notes.createNote({ title: 'Minutes' });
    await workspace.notes.updateNoteContent(note.id, 'quarterly');
    workspace['sqliteClient'].prepare('DELETE FROM search_index').run();

    const rebuilding = workspace.search.rebuild();
    await workspace.close();

    await expect(rebuilding).resolves.toEqual({ indexed: 1, unreadableNoteIds: [] });
    const reopened = await Workspace.open(makeInfo(tmpDir), OPTIONS);
    try {
      expect(searchIds(reopened, 'quarterly')).toEqual([note.id]);
    } finally {
      await reopened.close();
    }
  });

  it('whenIdle settles without rejecting when an index write fails', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });
      await fs.rm(path.join(tmpDir, 'notes', `${note.id}.md`));

      const indexing = workspace.search.indexNote(note);
      const idle = workspace.search.whenIdle();

      await expect(indexing).rejects.toThrow();
      await expect(idle).resolves.toBeUndefined();
    } finally {
      await workspace.close();
    }
  });

  it('leaves out a note archived while the files are read', async () => {
    const workspace = await Workspace.create(makeInfo(tmpDir), OPTIONS);
    try {
      const note = await workspace.notes.createNote({ title: 'Minutes' });

      const rebuilding = workspace.search.rebuild();
      workspace.archive.archiveNote(note.id);
      await rebuilding;

      expect(searchIds(workspace, 'Minutes')).toEqual([]);
    } finally {
      await workspace.close();
    }
  });
});

describe('Workspace.open — failed migrations', () => {
  // the workspace lives in its own folder so the extra migrations folder sits beside it
  let workspaceDir: string;
  let info: WorkspaceInfo;
  let projectId: string;

  beforeEach(async () => {
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(workspaceDir);
    info = makeInfo(workspaceDir);
    const created = await Workspace.create(info, OPTIONS);
    projectId = created.projects.createProject({ title: 'Kept', dueDate: new Date() }).id;
    await created.close();
  });

  // the real migrations plus the extra one openFailure runs
  let extraMigrations: string;

  /** opens Workspace with the real migrations plus one extra, `sql` */
  function useExtraMigration(tag: string, sql: string) {
    extraMigrations = migrationsWithExtra(path.join(tmpDir, tag), tag, sql);
  }

  async function openFailure(): Promise<WorkspaceMigrationError> {
    const error = await Workspace.open(info, { ...OPTIONS, migrationsPath: extraMigrations }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(WorkspaceMigrationError);
    return error as WorkspaceMigrationError;
  }

  function readDb<T>(query: (sqlite: Database.Database) => T): T {
    const sqlite = new Database(path.join(workspaceDir, 'db.sqlite'), { readonly: true });
    try {
      return query(sqlite);
    } finally {
      sqlite.close();
    }
  }

  it('restores the backup when the migration committed broken references', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const error = await openFailure();

    expect(error.code).toBe('workspace_migration');
    expect(error.committed).toBe(true);
    expect(error.restoredFromBackup).toBe(true);
    expect(error.backupPath).toBe(path.join(workspaceDir, 'db.sqlite.backup'));
    expect(error.message).toMatch(/restored from the backup/);

    // the committed migration and its row are gone; the data from before the open is intact
    readDb((sqlite) => {
      expect(
        sqlite.prepare(`SELECT id FROM tasks WHERE id = 'tsk_dangling'`).get(),
      ).toBeUndefined();
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
      expect(
        sqlite.prepare('SELECT max(created_at) FROM __drizzle_migrations').pluck().get(),
      ).not.toBe(null);
    });

    // with the bad migration gone, the restored workspace opens normally
    const opened = await Workspace.open(info, OPTIONS);
    expect(opened.projects.getById(projectId as never).title).toBe('Kept');
    await opened.close();
  });

  it('leaves the database as it was, without restoring, when the migration rolled back', async () => {
    useExtraMigration(
      '0099_broken',
      `CREATE TABLE rolled_back (id text);--> statement-breakpoint
INSERT INTO no_such_table VALUES (1);`,
    );
    const backupPath = path.join(workspaceDir, 'db.sqlite.backup');
    const error = await openFailure();

    expect(error.committed).toBe(false);
    expect(error.restoredFromBackup).toBe(false);
    expect(error.backupPath).toBe(backupPath);
    expect(error.message).toMatch(/no changes were made/);

    readDb((sqlite) => {
      expect(
        sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'rolled_back'`).get(),
      ).toBeUndefined();
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
    });

    // the failed open closed its connection, so the workspace opens again straight away
    const opened = await Workspace.open(info, OPTIONS);
    await opened.close();
  });

  it('removes WAL files left beside the database before restoring the backup', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const dbPath = path.join(workspaceDir, 'db.sqlite');
    // the failed open's close leaves a WAL behind, as a connection that could not checkpoint does
    const close = Database.prototype.close;
    const spy = vi.spyOn(Database.prototype, 'close').mockImplementationOnce(function (
      this: Database.Database,
    ) {
      close.call(this);
      fsSync.writeFileSync(`${dbPath}-wal`, 'stale');
      fsSync.writeFileSync(`${dbPath}-shm`, 'stale');
      return this;
    });
    try {
      const error = await openFailure();
      expect(error.restoredFromBackup).toBe(true);
    } finally {
      spy.mockRestore();
    }

    expect(fsSync.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fsSync.existsSync(`${dbPath}-shm`)).toBe(false);
    readDb((sqlite) => {
      expect(sqlite.prepare(`SELECT id FROM projects`).pluck().all()).toEqual([projectId]);
    });
  });

  it('reports a failed restore without claiming the database was restored', async () => {
    useExtraMigration(
      '0099_dangling',
      `INSERT INTO tasks (id, title, project_id) VALUES ('tsk_dangling', 'Dangling', 'prj_missing');`,
    );
    const copyFile = vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('disk full'));
    try {
      const error = await openFailure();
      expect(copyFile).toHaveBeenCalledOnce();
      expect(error.committed).toBe(true);
      expect(error.restoredFromBackup).toBe(false);
      expect(error.message).toMatch(/restoring the backup at .* failed/);
      expect((error.cause as Error).message).toBe('disk full');
    } finally {
      copyFile.mockRestore();
    }
  });
});

function issue() {
  return {
    externalId: 'issue-1',
    key: 'ENG-1',
    url: 'https://linear.app/acme/issue/ENG-1',
    title: 'Issue 1',
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
  };
}

describe('Workspace — integration cancellation', () => {
  it.each(['connect', 'reconnect'] as const)(
    'prevents late writes from a pending %s that ignores cancellation',
    async (operation) => {
      const provider = createFakeProvider();
      const cipher = new FakeCipher();
      const info = makeInfo(tmpDir);
      const options = { ...OPTIONS, cipher, providers: fakeRegistry(provider) };
      const workspace = await Workspace.create(info, options);
      const existing =
        operation === 'reconnect'
          ? await workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY)
          : null;
      const account = await provider.getAccount({ authorization: FAKE_API_KEY });
      const answer = deferred<typeof account>();
      const getAccount = vi.spyOn(provider, 'getAccount').mockReturnValueOnce(answer.promise);
      const pending = existing
        ? workspace.integrations.reconnect(existing.id, {
            type: AuthType.API_KEY,
            apiKey: FAKE_API_KEY,
          })
        : workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'WorkspaceClosedError',
        code: 'workspace_closed',
      });
      expect(getAccount).toHaveBeenCalledOnce();
      // An unrelated operation can finish while the provider call is outstanding.
      expect(
        workspace.projects.createProject({ title: 'Concurrent', dueDate: new Date() }),
      ).toMatchObject({ title: 'Concurrent' });
      const closeSqlite = vi.spyOn(Database.prototype, 'close');
      try {
        const closing = workspace.close();
        expect(workspace.close()).toBe(closing);
        await closing;
        expect(closeSqlite).toHaveBeenCalledOnce();
        expect(getAccount.mock.calls[0][1]?.signal?.aborted).toBe(true);
        // Reconnect must reject before its initial SQLite read as well.
        const late = existing
          ? workspace.integrations.reconnect(existing.id, {
              type: AuthType.API_KEY,
              apiKey: FAKE_API_KEY,
            })
          : workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
        await expect(late).rejects.toBeInstanceOf(WorkspaceClosedError);
        answer.resolve(account);
        await Promise.all([closing, rejected]);
        expect(closeSqlite).toHaveBeenCalledOnce();
      } finally {
        closeSqlite.mockRestore();
      }
      const reopened = await Workspace.open(info, options);
      try {
        expect(reopened.integrations.list()).toHaveLength(existing ? 1 : 0);
      } finally {
        await reopened.close();
      }
    },
  );

  it.each(['connect', 'reconnect'] as const)(
    'cancels a hanging Linear account query during %s',
    async (operation) => {
      const fetch = scriptedFetch(
        operation === 'connect' ? [{ hang: true }] : [{ body: viewerFixture }, { hang: true }],
      );
      const workspace = await Workspace.create(makeInfo(tmpDir), {
        ...OPTIONS,
        cipher: new FakeCipher(),
        fetch,
      });
      const existing =
        operation === 'reconnect'
          ? await workspace.integrations.connectWithApiKey(Provider.LINEAR, 'lin_api_test')
          : null;
      const pending = existing
        ? workspace.integrations.reconnect(existing.id, {
            type: AuthType.API_KEY,
            apiKey: 'lin_api_test',
          })
        : workspace.integrations.connectWithApiKey(Provider.LINEAR, 'lin_api_test');
      const rejected = expect(pending).rejects.toMatchObject({
        name: 'WorkspaceClosedError',
        code: 'workspace_closed',
      });
      await vi.waitFor(() => expect(fetch.requests).toHaveLength(existing ? 2 : 1));
      await workspace.close();
      await rejected;
      expect(fetch.requests.at(-1)?.signal?.aborted).toBe(true);
    },
  );

  it('opens http and https links through openUrl, and nothing else', async () => {
    const browser = vi.fn(async () => {});
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      openExternal: browser,
    });
    try {
      await workspace.openUrl('https://meet.google.com/abc-defg-hij');
      await expect(workspace.openUrl('javascript:alert(1)')).rejects.toBeInstanceOf(UnsafeUrlError);
      await expect(workspace.openUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError);
      expect(browser.mock.calls).toEqual([['https://meet.google.com/abc-defg-hij']]);
    } finally {
      await workspace.close();
    }
  });

  it('cancels OAuth while waiting for the browser callback', async () => {
    const browser = vi.fn(async () => {});
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher: new FakeCipher(),
      openExternal: browser,
      providers: new Map([
        [
          Provider.GOOGLE_CALENDAR,
          createGoogleCalendarProvider({ fetch, client: { clientId: 'test-client' } }),
        ],
      ]),
    });
    const pending = workspace.integrations.connectWithOAuth(Provider.GOOGLE_CALENDAR);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'WorkspaceClosedError',
      code: 'workspace_closed',
    });
    await vi.waitFor(() => expect(browser).toHaveBeenCalledOnce());
    await workspace.close();
    await rejected;
  });
});

describe('Workspace — failed opening cleanup', () => {
  it.each(['backup', 'pragma', 'services'] as const)(
    'closes SQLite when %s fails during open',
    async (stage) => {
      const info = makeInfo(tmpDir);
      const created = await Workspace.create(info, OPTIONS);
      await created.close();
      const failure = new Error(`${stage} failed`);
      const providers = fakeRegistry(createFakeProvider());
      const fail =
        stage === 'backup'
          ? vi.spyOn(Database.prototype, 'backup').mockRejectedValueOnce(failure)
          : stage === 'pragma'
            ? vi.spyOn(Database.prototype, 'pragma').mockImplementationOnce(() => {
                throw failure;
              })
            : vi.spyOn(providers, 'values').mockImplementationOnce(() => {
                throw failure;
              });
      const close = vi.spyOn(Database.prototype, 'close');
      try {
        await expect(Workspace.open(info, { ...OPTIONS, providers })).rejects.toBe(failure);
        expect(close).toHaveBeenCalledOnce();
      } finally {
        fail.mockRestore();
        close.mockRestore();
      }
      const reopened = await Workspace.open(info, OPTIONS);
      await reopened.close();
    },
  );

  it('prevents an insert when encryption finishes after close', async () => {
    const cipher = new FakeCipher();
    const workspace = await Workspace.create(makeInfo(tmpDir), {
      ...OPTIONS,
      cipher,
      providers: fakeRegistry(createFakeProvider()),
    });
    const encrypt = cipher.encrypt.bind(cipher);
    const release = deferred<void>();
    const encrypting = vi.spyOn(cipher, 'encrypt').mockImplementationOnce(async (plain) => {
      await release.promise;
      return encrypt(plain);
    });
    const pending = workspace.integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'WorkspaceClosedError',
      code: 'workspace_closed',
    });
    await vi.waitFor(() => expect(encrypting).toHaveBeenCalledOnce());
    await workspace.close();
    release.resolve(undefined);
    await rejected;
    const reopened = await Workspace.open(makeInfo(tmpDir), OPTIONS);
    try {
      expect(reopened.integrations.list()).toEqual([]);
    } finally {
      await reopened.close();
    }
  });
});
