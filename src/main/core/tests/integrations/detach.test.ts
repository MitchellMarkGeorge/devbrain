import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { ExternalSourceId, IntegrationId, TaskId } from '@common/ids';
import { externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import {
  createFakeProvider,
  FakeProvider,
  fakeRegistry,
  FAKE_API_KEY,
} from '../sync/fake-provider';
import { SyncEngine } from '../../sync/engine';
import { SyncWriter } from '../../sync/writer';
import { SearchService } from '../../search/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { DetachService, TaskLinkChange } from '../../integrations/detach';
import {
  ExternalProject,
  ExternalTask,
  LinkState,
  Provider as ProviderId,
} from '../../integrations/types';
import { TaskService } from '../../tasks/service';
import { NoteService } from '../../notes/service';
import { ArchiveService } from '../../archive/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import { projects as projectsTable } from '@main/db/schema/projects';
import { DetachError, ExternalReadOnlyError, NotFoundError } from '../../shared/errors';

const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');
const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

let db: BetterSQLite3Database;
let workspacePath: string;
let provider: FakeProvider;
let service: IntegrationService;
let engine: SyncEngine;
let detach: DetachService;
let tasks: TaskService;
let notes: NoteService;
let archive: ArchiveService;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let changes: TaskLinkChange[];
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
    createdAt: CREATED,
    updatedAt: V1,
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
    ...overrides,
  };
}

function project(overrides: Partial<ExternalProject> = {}): ExternalProject {
  itemCount += 1;
  return {
    externalId: `project-${itemCount}`,
    url: `https://linear.app/acme/project/project-${itemCount}`,
    title: `Project ${itemCount}`,
    description: null,
    status: ProjectStatus.ACTIVE,
    statusLabel: 'Started',
    startDate: null,
    dueDate: null,
    color: null,
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

// a three-level Linear tree: root, child, grandchild
function tree(): [ExternalTask, ExternalTask, ExternalTask] {
  const root = issue({ title: 'Root' });
  const child = issue({ title: 'Child', parentExternalId: root.externalId });
  const grandchild = issue({ title: 'Grandchild', parentExternalId: child.externalId });
  return [root, child, grandchild];
}

// mirrors the issues by running the engine against the fake provider
async function sync(...issues: ExternalTask[]) {
  provider.tasks.script({ tasks: issues });
  await engine.runSource(sourceId);
}

// the next lookup answers with these; anything asked for and not listed is gone
function answerLookup(found: ExternalTask[], projects: ExternalProject[] = []) {
  const byId = new Map(found.map((item) => [item.externalId, item]));
  provider.tasks.respondToLookup = ({ externalIds }) => ({
    tasks: externalIds.flatMap((id) => byId.get(id) ?? []),
    projects,
    gone: externalIds.filter((id) => !byId.has(id)),
  });
}

// the issue ids each lookup asked for
function lookups(): string[][] {
  return provider.tasks.lookups.map((lookup) => lookup.externalIds);
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get()!;
}

function taskOf(externalId: string) {
  const taskId = linkOf(externalId).taskId!;
  return db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).get()!;
}

function idOf(item: ExternalTask): TaskId {
  return linkOf(item.externalId).taskId!;
}

function stateOf(item: ExternalTask): LinkState {
  return linkOf(item.externalId).state;
}

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-detach-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  db = createDb();
  provider = createFakeProvider();
  const providers = fakeRegistry(provider);
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  service = new IntegrationService(db, { credentials, providers });
  const writer = new SyncWriter(db, new SearchService(db, workspacePath));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  engine = new SyncEngine(db, { integrations: service, credentials, providers, writer, logger });
  detach = new DetachService(db, { integrations: service, credentials, providers, writer });
  tasks = new TaskService(db);
  notes = new NoteService(db, workspacePath);
  archive = new ArchiveService(db);

  const integration = await service.connectWithApiKey(ProviderId.LINEAR, FAKE_API_KEY);
  integrationId = integration.id;
  sourceId = integration.sources[0].id;
  changes = [];
  detach.onChange((change) => changes.push(change));
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('DetachService — detach', () => {
  it('makes a synced task editable and keeps sync away from it', async () => {
    const item = issue({ title: 'From Linear' });
    await sync(item);
    const id = idOf(item);
    await expect(tasks.updateTask(id, { title: 'Mine' })).rejects.toThrow(ExternalReadOnlyError);

    const detached = await detach.detachTask(id);

    expect(detached.external?.state).toBe(LinkState.DETACHED);
    expect(detached.external?.key).toBe(item.key);
    const updated = await tasks.updateTask(id, { title: 'Mine' });
    expect(updated?.title).toBe('Mine');

    // a newer copy from Linear does not overwrite the local one
    await sync({ ...item, title: 'Renamed in Linear', updatedAt: V2 });
    expect(taskOf(item.externalId).title).toBe('Mine');
    expect(stateOf(item)).toBe(LinkState.DETACHED);
  });

  it('detaches all descendants of a parent, at any depth', async () => {
    const [root, child, grandchild] = tree();
    const unrelated = issue();
    await sync(root, child, grandchild, unrelated);

    await detach.detachTask(idOf(root));

    expect([root, child, grandchild].map(stateOf)).toEqual([
      LinkState.DETACHED,
      LinkState.DETACHED,
      LinkState.DETACHED,
    ]);
    expect(stateOf(unrelated)).toBe(LinkState.SYNCED);
    expect(changes).toEqual([
      {
        type: 'detached',
        taskId: idOf(root),
        taskIds: expect.arrayContaining([idOf(root), idOf(child), idOf(grandchild)]),
        changed: ['task'],
      },
    ]);
    expect(changes[0].taskIds).toHaveLength(3);
  });

  it('detaches only the subtree of a child, leaving its parent synced', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);

    await detach.detachTask(idOf(child));

    expect([root, child, grandchild].map(stateOf)).toEqual([
      LinkState.SYNCED,
      LinkState.DETACHED,
      LinkState.DETACHED,
    ]);
  });

  it('refuses a local task, a detached one and an archived one', async () => {
    const local = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    await expect(detach.detachTask(local.id)).rejects.toThrow(DetachError);

    const item = issue();
    await sync(item);
    await detach.detachTask(idOf(item));
    await expect(detach.detachTask(idOf(item))).rejects.toThrow(/already detached/);

    archive.archiveTask(idOf(item));
    await expect(detach.detachTask(idOf(item))).rejects.toThrow(NotFoundError);
    expect(changes).toHaveLength(1);
  });

  it('lets a detached three-level subtree be edited without tripping the depth guards', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);
    await detach.detachTask(idOf(root));

    // the middle task is a subtask with a subtask of its own, which local tasks never are
    await tasks.updateTask(idOf(child), { title: 'Middle' });
    await tasks.updateStatus(idOf(child), TaskStatus.IN_PROGRESS);
    await tasks.updateTask(idOf(grandchild), { title: 'Leaf' });
    await tasks.updateStatus(idOf(grandchild), TaskStatus.COMPLETED);
    const note = await notes.createNote({ title: 'Plan' });
    await tasks.updateLinks(idOf(root), { linkedNoteId: note.id });

    const promoted = await tasks.promoteSubtask(idOf(child));
    expect(promoted.parentTaskId).toBeNull();
    expect(taskOf(grandchild.externalId).parentTaskId).toBe(idOf(child));
    expect(taskOf(child.externalId)).toMatchObject({
      title: 'Middle',
      status: TaskStatus.IN_PROGRESS,
    });
    expect(taskOf(grandchild.externalId).status).toBe(TaskStatus.COMPLETED);
  });
});

describe('DetachService — reattach', () => {
  it("overwrites the local title with Linear's and keeps the linked note and task note", async () => {
    const item = issue({ title: 'From Linear' });
    await sync(item);
    const id = idOf(item);
    await detach.detachTask(id);
    await tasks.updateTask(id, { title: 'Mine', priority: TaskPriority.HIGH });
    const linked = await notes.createNote({ title: 'Linked' });
    await tasks.updateLinks(id, { linkedNoteId: linked.id });
    const taskNote = await notes.createNote({ title: 'Task note', linkedTaskId: id });

    // Linear has not changed the issue since it was mirrored; the local edits still go
    answerLookup([{ ...item, statusLabel: 'In Review' }]);
    const reattached = await detach.reattachTask(id);

    expect(lookups()).toEqual([[item.externalId]]);
    expect(reattached).toMatchObject({
      title: 'From Linear',
      priority: TaskPriority.LOW,
      linkedNoteId: linked.id,
    });
    expect(reattached.external).toMatchObject({
      state: LinkState.SYNCED,
      statusLabel: 'In Review',
    });
    expect(linkOf(item.externalId).externalUpdatedAt).toEqual(item.updatedAt);
    expect((await notes.getById(taskNote.id)).linkedTaskId).toBe(id);
    await expect(tasks.updateTask(id, { title: 'Again' })).rejects.toThrow(ExternalReadOnlyError);
    expect(changes.at(-1)).toEqual({
      type: 'reattached',
      taskId: id,
      taskIds: [id],
      changed: ['task'],
    });

    // synced again, so the next newer copy is applied
    await sync({ ...item, title: 'Renamed in Linear', updatedAt: V2 });
    expect(taskOf(item.externalId).title).toBe('Renamed in Linear');
  });

  it('throws for a deleted issue and leaves the task detached', async () => {
    const item = issue();
    await sync(item);
    const id = idOf(item);
    await detach.detachTask(id);
    await tasks.updateTask(id, { title: 'Mine' });

    answerLookup([]);
    await expect(detach.reattachTask(id)).rejects.toThrow(/no longer exists/);

    expect(stateOf(item)).toBe(LinkState.DETACHED);
    expect(taskOf(item.externalId).title).toBe('Mine');
    expect(changes.map((change) => change.type)).toEqual(['detached']);
  });

  it('throws for an issue no longer assigned to the viewer and leaves the task detached', async () => {
    const item = issue();
    await sync(item);
    await detach.detachTask(idOf(item));

    answerLookup([{ ...item, assignedToViewer: false }]);
    await expect(detach.reattachTask(idOf(item))).rejects.toThrow(/no longer assigned/);

    expect(stateOf(item)).toBe(LinkState.DETACHED);
    expect(taskOf(item.externalId).archivedAt).toBeNull();
  });

  it('reattaches the detached subtree of a parent in the same call', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);
    await detach.detachTask(idOf(root));
    for (const item of [root, child, grandchild]) {
      await tasks.updateTask(idOf(item), { title: 'Local edit' });
    }

    answerLookup([root, child, grandchild]);
    await detach.reattachTask(idOf(root));

    expect(lookups()[0].sort()).toEqual(
      [root.externalId, child.externalId, grandchild.externalId].sort(),
    );
    expect([root, child, grandchild].map(stateOf)).toEqual([
      LinkState.SYNCED,
      LinkState.SYNCED,
      LinkState.SYNCED,
    ]);
    expect([root, child, grandchild].map((item) => taskOf(item.externalId).title)).toEqual([
      'Root',
      'Child',
      'Grandchild',
    ]);
    expect(taskOf(grandchild.externalId).parentTaskId).toBe(idOf(child));
    expect(changes.at(-1)?.taskIds).toHaveLength(3);
  });

  it('mirrors the project the issue moved to while it was detached', async () => {
    const item = issue();
    await sync(item);
    await detach.detachTask(idOf(item));

    const proj = project({ title: 'Launch' });
    answerLookup([{ ...item, projectExternalId: proj.externalId }], [proj]);
    await detach.reattachTask(idOf(item));

    const mirrored = db.select().from(projectsTable).all();
    expect(mirrored.map((row) => row.title)).toEqual(['Launch']);
    expect(taskOf(item.externalId).projectId).toBe(mirrored[0].id);
    expect(changes.at(-1)?.changed.sort()).toEqual(['project', 'task']);
  });

  it('leaves a descendant that no longer resolves detached and top-level', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);
    await detach.detachTask(idOf(root));

    // the child was deleted in Linear; the grandchild now hangs off the root there
    answerLookup([root, { ...grandchild, parentExternalId: root.externalId }]);
    await detach.reattachTask(idOf(root));

    expect([root, child, grandchild].map(stateOf)).toEqual([
      LinkState.SYNCED,
      LinkState.DETACHED,
      LinkState.SYNCED,
    ]);
    expect(taskOf(child.externalId)).toMatchObject({ parentTaskId: null, archivedAt: null });
    expect(taskOf(grandchild.externalId).parentTaskId).toBe(idOf(root));
  });

  it('refuses a task with a local subtask and changes nothing', async () => {
    const item = issue();
    await sync(item);
    const id = idOf(item);
    await detach.detachTask(id);
    await tasks.updateTask(id, { title: 'Mine', dueDate: TOMORROW });
    const local = await tasks.createSubtask(id, { title: 'Local subtask' });
    answerLookup([item]);

    await expect(detach.reattachTask(id)).rejects.toThrow(/local subtasks/);

    expect(lookups()).toEqual([]);
    expect(stateOf(item)).toBe(LinkState.DETACHED);
    expect(taskOf(item.externalId).title).toBe('Mine');
    expect((await tasks.getById(local.id)).parentTaskId).toBe(id);
  });

  it('refuses a local subtask deeper in the detached subtree', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);
    await detach.detachTask(idOf(root));
    // the child becomes top-level, gets a local subtask, and goes back under the root by hand
    await tasks.promoteSubtask(idOf(grandchild));
    await tasks.updateTask(idOf(grandchild), { dueDate: TOMORROW });
    await tasks.createSubtask(idOf(grandchild), { title: 'Local' });
    db.update(tasksTable)
      .set({ parentTaskId: idOf(child) })
      .where(eq(tasksTable.id, idOf(grandchild)))
      .run();
    answerLookup([root, child, grandchild]);

    await expect(detach.reattachTask(idOf(root))).rejects.toThrow(/local subtasks/);
    expect(stateOf(root)).toBe(LinkState.DETACHED);
  });

  it('refuses a task that is not detached', async () => {
    const local = await tasks.createTask({ title: 'Local', dueDate: TOMORROW });
    await expect(detach.reattachTask(local.id)).rejects.toThrow(DetachError);

    const item = issue();
    await sync(item);
    await expect(detach.reattachTask(idOf(item))).rejects.toThrow(/not detached/);
  });

  it('refuses while the integration is disabled or the source is off', async () => {
    const item = issue();
    await sync(item);
    await detach.detachTask(idOf(item));
    answerLookup([item]);

    await service.setEnabled(integrationId, false);
    await expect(detach.reattachTask(idOf(item))).rejects.toThrow(/integration is disabled/);

    await service.setEnabled(integrationId, true);
    await service.setSourceEnabled(sourceId, false);
    await expect(detach.reattachTask(idOf(item))).rejects.toThrow(/source is turned off/);

    expect(lookups()).toEqual([]);
    expect(stateOf(item)).toBe(LinkState.DETACHED);
  });

  it('refuses a task whose integration was disconnected', async () => {
    const item = issue();
    await sync(item);
    const id = idOf(item);
    await detach.detachTask(id);
    // a disconnect deletes the source, which nulls the link's sourceId
    db.update(externalLinks).set({ sourceId: null }).where(eq(externalLinks.taskId, id)).run();

    await expect(detach.reattachTask(id)).rejects.toThrow(/disconnected/);
    const [link] = db.select().from(externalLinks).where(eq(externalLinks.taskId, id)).all();
    expect(link.state).toBe(LinkState.DETACHED);
  });
});

describe('DetachService — archive', () => {
  it('archives and restores every level of a detached three-level subtree', async () => {
    const [root, child, grandchild] = tree();
    await sync(root, child, grandchild);
    await detach.detachTask(idOf(root));
    const note = await notes.createNote({ title: 'Leaf note', linkedTaskId: idOf(grandchild) });

    archive.archiveTask(idOf(root));

    for (const item of [root, child, grandchild]) {
      expect(taskOf(item.externalId).archivedAt).not.toBeNull();
    }
    expect(archive.listArchived({ entityType: 'notes' }).items.map((row) => row.id)).toEqual([
      note.id,
    ]);

    archive.restoreTask(idOf(root));

    for (const item of [root, child, grandchild]) {
      expect(taskOf(item.externalId).archivedAt).toBeNull();
    }
    expect(archive.listArchived().items).toEqual([]);
  });
});
