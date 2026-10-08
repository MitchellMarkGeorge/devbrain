import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { ExternalSourceId, generateId, ProjectId, TaskId } from '@common/ids';
import { integrations, externalSources, externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { projects as projectsTable } from '@main/db/schema/projects';
import { createDb } from '../utils';
import { SyncWriter } from '../../sync/writer';
import { TaskPageItems } from '../../sync/types';
import { SearchService } from '../../search/service';
import { TaskService } from '../../tasks/service';
import { ProjectService } from '../../projects/service';
import { NoteService } from '../../notes/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ProjectStatus } from '../../projects/types';
import {
  AuthType,
  ExternalProject,
  ExternalTask,
  LinkState,
  Provider,
  SourceType,
} from '../../integrations/types';
import { NotFoundError } from '../../shared/errors';

const CREATED = new Date('2026-01-15T09:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');

let db: BetterSQLite3Database;
let search: SearchService;
let writer: SyncWriter;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let workspacePath: string;
let sourceId: ExternalSourceId;
let itemCount = 0;

// a Linear issue as the mapper hands it over, assigned to the viewer
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
    color: '#5e6ad2',
    completedAt: null,
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

// a sub-issue of `parent`, carrying the parent fields the mapper fills in
function childOf(parent: ExternalTask, overrides: Partial<ExternalTask> = {}): ExternalTask {
  return issue({
    parentExternalId: parent.externalId,
    parentKey: parent.key,
    parentTitle: parent.title,
    ...overrides,
  });
}

function page(items: Partial<TaskPageItems>): TaskPageItems {
  return { projects: [], tasks: [], removedIds: [], ...items };
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get();
}

function taskIdOf(externalId: string): TaskId {
  return linkOf(externalId)!.taskId!;
}

function projectIdOf(externalId: string): ProjectId {
  return linkOf(externalId)!.projectId!;
}

// the raw row, archived or not (the service reads only live rows in some paths)
function taskRow(externalId: string) {
  return db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, taskIdOf(externalId)))
    .get()!;
}

function projectRow(id: ProjectId) {
  return db.select().from(projectsTable).where(eq(projectsTable.id, id)).get()!;
}

function setLinkState(externalId: string, state: LinkState) {
  db.update(externalLinks)
    .set({ state })
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .run();
}

function count(table: typeof tasksTable | typeof projectsTable | typeof externalLinks): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()!.n;
}

function searchIds(query: string): string[] {
  return search.search({ query, entityType: [] }).map((result) => result.entityId);
}

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-writer-'));
  search = new SearchService(db, workspacePath);
  writer = new SyncWriter(db, search);
  tasks = new TaskService(db);
  projects = new ProjectService(db);
  notes = new NoteService(db, workspacePath);
  const integrationId = db
    .insert(integrations)
    .values({
      provider: Provider.LINEAR,
      authType: AuthType.API_KEY,
      accountId: 'org:user',
      accountLabel: 'Ada, Acme',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.TASKS })
    .returning()
    .get().id;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SyncWriter — no link: insert', () => {
  it('inserts the task and a synced link, with provider-owned fields and createdAt', async () => {
    const item = issue({
      title: 'Fix login redirect',
      description: 'Users land on **404**',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      statusLabel: 'In Review',
      priorityLabel: 'Urgent',
      startDate: new Date(2026, 9, 1),
      dueDate: new Date(2026, 9, 9),
    });

    const summary = writer.applyTaskPage(sourceId, page({ tasks: [item] }));

    expect(summary).toEqual({ inserted: 1, updated: 0, removed: 0, changed: ['task'] });
    const task = await tasks.getById(taskIdOf(item.externalId));
    expect(task).toMatchObject({
      title: 'Fix login redirect',
      description: 'Users land on **404**',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      startDate: new Date(2026, 9, 1),
      dueDate: new Date(2026, 9, 9),
      parentTaskId: null,
      projectId: null,
      completedAt: null,
      createdAt: CREATED,
      archivedAt: null,
    });
    expect(task.external).toMatchObject({
      provider: Provider.LINEAR,
      state: LinkState.SYNCED,
      key: item.key,
      url: item.url,
      statusLabel: 'In Review',
      priorityLabel: 'Urgent',
    });
    expect(linkOf(item.externalId)).toMatchObject({
      externalUpdatedAt: V1,
      removedAt: null,
      settledAt: null,
    });
  });

  it('inserts the project and its link, and puts the task in it', async () => {
    const proj = project({ title: 'Checkout revamp', dueDate: null });
    const item = issue({ projectExternalId: proj.externalId });

    const summary = writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));

    expect(summary).toEqual({
      inserted: 2,
      updated: 0,
      removed: 0,
      changed: ['project', 'task'],
    });
    const created = await projects.getById(projectIdOf(proj.externalId));
    expect(created).toMatchObject({
      title: 'Checkout revamp',
      status: ProjectStatus.ACTIVE,
      color: '#5e6ad2',
      dueDate: null,
      createdAt: CREATED,
    });
    expect(created.external).toMatchObject({ state: LinkState.SYNCED, statusLabel: 'Started' });
    expect((await tasks.getById(taskIdOf(item.externalId))).projectId).toBe(created.id);
  });

  it('keeps completedAt for completed issues and leaves it null for cancelled ones', async () => {
    const done = issue({ status: TaskStatus.COMPLETED, completedAt: V1 });
    const cancelled = issue({ status: TaskStatus.CANCELLED });

    writer.applyTaskPage(sourceId, page({ tasks: [done, cancelled] }));

    expect(taskRow(done.externalId).completedAt).toEqual(V1);
    expect(taskRow(cancelled.externalId)).toMatchObject({
      status: TaskStatus.CANCELLED,
      completedAt: null,
    });
  });

  it('indexes the task and project for search', () => {
    const proj = project({ title: 'Observability rollout' });
    const item = issue({ title: 'Wire tracing exporter', projectExternalId: proj.externalId });

    writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));

    expect(searchIds('tracing')).toEqual([taskIdOf(item.externalId)]);
    expect(searchIds('Observability')).toEqual([projectIdOf(proj.externalId)]);
  });

  it('throws NotFoundError for an unknown source and writes nothing', () => {
    expect(() =>
      writer.applyTaskPage(generateId('externalSource'), page({ tasks: [issue()] })),
    ).toThrow(NotFoundError);
    expect(count(tasksTable)).toBe(0);
  });
});

describe('SyncWriter — synced, remote unchanged', () => {
  it('re-applying the same page writes nothing but lastSyncedAt', async () => {
    const proj = project();
    const item = issue({ projectExternalId: proj.externalId });
    writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));
    const taskBefore = taskRow(item.externalId);
    const projectBefore = projectRow(projectIdOf(proj.externalId));
    const linkBefore = linkOf(item.externalId)!;

    vi.useFakeTimers({ now: new Date('2026-10-05T08:00:00Z'), toFake: ['Date'] });
    try {
      const summary = writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));
      expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: [] });
    } finally {
      vi.useRealTimers();
    }

    // the entity rows are untouched, updatedAt included
    expect(taskRow(item.externalId)).toEqual(taskBefore);
    expect(projectRow(projectIdOf(proj.externalId))).toEqual(projectBefore);
    expect(count(tasksTable)).toBe(1);
    expect(count(externalLinks)).toBe(2);
    // only the links record that they were seen
    expect(linkOf(item.externalId)).toEqual({
      ...linkBefore,
      lastSyncedAt: new Date('2026-10-05T08:00:00Z'),
    });
    expect(linkOf(proj.externalId)!.lastSyncedAt).toEqual(new Date('2026-10-05T08:00:00Z'));
  });

  it('an older copy (from the cursor overlap) does not overwrite a newer one', () => {
    const item = issue({ title: 'Newer', updatedAt: V2 });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));

    const summary = writer.applyTaskPage(
      sourceId,
      page({ tasks: [{ ...item, title: 'Older', updatedAt: V1 }] }),
    );

    expect(summary.updated).toBe(0);
    expect(taskRow(item.externalId).title).toBe('Newer');
  });
});

describe('SyncWriter — synced, remote changed', () => {
  it('updates provider-owned fields; a linked note and favourite survive', async () => {
    const item = issue({ title: 'Draft spec' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    const taskId = taskIdOf(item.externalId);
    // DevBrain-owned fields, set the way the user would
    const note = await notes.createNote({ title: 'Spec notes' });
    await tasks.updateLinks(taskId, { linkedNoteId: note.id });
    const favoritedAt = new Date('2026-10-01T15:00:00Z');
    db.update(tasksTable).set({ favoritedAt }).where(eq(tasksTable.id, taskId)).run();

    const summary = writer.applyTaskPage(
      sourceId,
      page({
        tasks: [
          {
            ...item,
            title: 'Final spec',
            status: TaskStatus.COMPLETED,
            statusLabel: 'Done',
            completedAt: V2,
            dueDate: new Date(2026, 9, 3),
            updatedAt: V2,
          },
        ],
      }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 1, removed: 0, changed: ['task'] });
    const task = await tasks.getById(taskId);
    expect(task).toMatchObject({
      title: 'Final spec',
      status: TaskStatus.COMPLETED,
      completedAt: V2,
      dueDate: new Date(2026, 9, 3),
      createdAt: CREATED,
      linkedNoteId: note.id,
      favoritedAt,
    });
    expect(task.external?.statusLabel).toBe('Done');
    expect(linkOf(item.externalId)!.externalUpdatedAt).toEqual(V2);
  });

  it('re-indexes the changed title', () => {
    const item = issue({ title: 'Rotate signing keys' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));

    writer.applyTaskPage(
      sourceId,
      page({ tasks: [{ ...item, title: 'Rotate webhook secrets', updatedAt: V2 }] }),
    );

    expect(searchIds('signing')).toEqual([]);
    expect(searchIds('webhook')).toEqual([taskIdOf(item.externalId)]);
  });

  it('clears settledAt when a settled issue is reopened', () => {
    const item = issue({ status: TaskStatus.COMPLETED, completedAt: V1 });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    db.update(externalLinks)
      .set({ settledAt: V1 })
      .where(eq(externalLinks.externalId, item.externalId))
      .run();

    writer.applyTaskPage(
      sourceId,
      page({
        tasks: [{ ...item, status: TaskStatus.IN_PROGRESS, completedAt: null, updatedAt: V2 }],
      }),
    );

    expect(linkOf(item.externalId)!.settledAt).toBeNull();
    expect(taskRow(item.externalId)).toMatchObject({
      status: TaskStatus.IN_PROGRESS,
      completedAt: null,
    });
  });

  it('updates a changed project', async () => {
    const proj = project({ title: 'Q3 launch' });
    writer.applyTaskPage(sourceId, page({ projects: [proj] }));

    const summary = writer.applyTaskPage(
      sourceId,
      page({
        projects: [
          {
            ...proj,
            title: 'Q4 launch',
            status: ProjectStatus.COMPLETED,
            statusLabel: 'Completed',
            completedAt: V2,
            updatedAt: V2,
          },
        ],
      }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 1, removed: 0, changed: ['project'] });
    const updated = await projects.getById(projectIdOf(proj.externalId));
    expect(updated).toMatchObject({
      title: 'Q4 launch',
      status: ProjectStatus.COMPLETED,
      completedAt: V2,
    });
    expect(updated.external?.statusLabel).toBe('Completed');
  });

  it('an orphan issue that gains a project: the project is created and the task moves', async () => {
    const item = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    expect(taskRow(item.externalId).projectId).toBeNull();

    const proj = project({ title: 'Billing' });
    writer.applyTaskPage(
      sourceId,
      page({
        projects: [proj],
        tasks: [{ ...item, projectExternalId: proj.externalId, updatedAt: V2 }],
      }),
    );

    const projectId = projectIdOf(proj.externalId);
    expect((await projects.getById(projectId)).title).toBe('Billing');
    expect(taskRow(item.externalId).projectId).toBe(projectId);
  });

  it('an issue taken out of its project loses it', () => {
    const proj = project();
    const item = issue({ projectExternalId: proj.externalId });
    writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));

    writer.applyTaskPage(
      sourceId,
      page({ tasks: [{ ...item, projectExternalId: null, updatedAt: V2 }] }),
    );

    expect(taskRow(item.externalId).projectId).toBeNull();
  });
});

describe('SyncWriter — detached', () => {
  it('skips a detached task entirely', () => {
    const item = issue({ title: 'Mine now' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    setLinkState(item.externalId, LinkState.DETACHED);
    const taskBefore = taskRow(item.externalId);
    const linkBefore = linkOf(item.externalId);

    const summary = writer.applyTaskPage(
      sourceId,
      page({ tasks: [{ ...item, title: 'Changed in Linear', updatedAt: V2 }] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: [] });
    expect(taskRow(item.externalId)).toEqual(taskBefore);
    expect(linkOf(item.externalId)).toEqual(linkBefore);
    expect(count(tasksTable)).toBe(1);
  });

  it('skips a detached project, and its synced tasks do not live in it', () => {
    const proj = project({ title: 'Kept locally' });
    writer.applyTaskPage(sourceId, page({ projects: [proj] }));
    setLinkState(proj.externalId, LinkState.DETACHED);
    const item = issue({ projectExternalId: proj.externalId });

    writer.applyTaskPage(
      sourceId,
      page({ projects: [{ ...proj, title: 'Renamed', updatedAt: V2 }], tasks: [item] }),
    );

    expect(projectRow(projectIdOf(proj.externalId)).title).toBe('Kept locally');
    expect(taskRow(item.externalId).projectId).toBeNull();
  });

  it('removal leaves a detached task alone', () => {
    const item = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    setLinkState(item.externalId, LinkState.DETACHED);

    const summary = writer.removeTasks(sourceId, [item.externalId]);

    expect(summary.removed).toBe(0);
    expect(taskRow(item.externalId).archivedAt).toBeNull();
    expect(linkOf(item.externalId)!.state).toBe(LinkState.DETACHED);
  });
});

describe('SyncWriter — removed', () => {
  it('removeTasks archives the task, marks the link removed and drops it from search', () => {
    const item = issue({ title: 'Migrate cron jobs' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    expect(searchIds('cron')).toEqual([taskIdOf(item.externalId)]);

    const summary = writer.removeTasks(sourceId, [item.externalId, 'never-mirrored']);

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 1, changed: ['task'] });
    expect(taskRow(item.externalId).archivedAt).toBeInstanceOf(Date);
    expect(linkOf(item.externalId)).toMatchObject({ state: LinkState.REMOVED });
    expect(linkOf(item.externalId)!.removedAt).toBeInstanceOf(Date);
    expect(searchIds('cron')).toEqual([]);
  });

  it('removes the page’s removedIds and issues no longer assigned to the viewer', () => {
    const trashed = issue();
    const reassigned = issue();
    const kept = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [trashed, reassigned, kept] }));

    const summary = writer.applyTaskPage(
      sourceId,
      page({
        tasks: [{ ...reassigned, assignedToViewer: false, updatedAt: V2 }],
        removedIds: [trashed.externalId],
      }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 2, changed: ['task'] });
    expect(linkOf(trashed.externalId)!.state).toBe(LinkState.REMOVED);
    expect(linkOf(reassigned.externalId)!.state).toBe(LinkState.REMOVED);
    expect(linkOf(kept.externalId)!.state).toBe(LinkState.SYNCED);
  });

  it('a removed task that reappears is restored: synced, unarchived, updated, re-indexed', () => {
    const item = issue({ title: 'Flaky upload test' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    writer.removeTasks(sourceId, [item.externalId]);

    // restoring from the trash leaves updatedAt as it was, so the restore cannot wait for a change
    const summary = writer.applyTaskPage(
      sourceId,
      page({ tasks: [{ ...item, title: 'Flaky upload test, again' }] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 1, removed: 0, changed: ['task'] });
    expect(count(tasksTable)).toBe(1);
    expect(taskRow(item.externalId)).toMatchObject({
      title: 'Flaky upload test, again',
      archivedAt: null,
    });
    expect(linkOf(item.externalId)).toMatchObject({ state: LinkState.SYNCED, removedAt: null });
    expect(searchIds('Flaky')).toEqual([taskIdOf(item.externalId)]);
  });

  it('a removed project that reappears is restored and unarchived', () => {
    const proj = project();
    writer.applyTaskPage(sourceId, page({ projects: [proj] }));
    const projectId = projectIdOf(proj.externalId);
    // what the project lifecycle (feature 11) will do
    db.update(projectsTable).set({ archivedAt: V1 }).where(eq(projectsTable.id, projectId)).run();
    setLinkState(proj.externalId, LinkState.REMOVED);

    const item = issue({ projectExternalId: proj.externalId });
    writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [item] }));

    expect(linkOf(proj.externalId)!.state).toBe(LinkState.SYNCED);
    expect(projectRow(projectId).archivedAt).toBeNull();
    expect(taskRow(item.externalId).projectId).toBe(projectId);
  });
});

describe('SyncWriter — subtasks', () => {
  it('a child before its parent in one page ends up nested', () => {
    const parent = issue();
    const child = childOf(parent);

    writer.applyTaskPage(sourceId, page({ tasks: [child, parent] }));

    expect(taskRow(child.externalId).parentTaskId).toBe(taskIdOf(parent.externalId));
    expect(taskRow(parent.externalId).parentTaskId).toBeNull();
  });

  it('three levels of sub-issues nest fully, in any page order', () => {
    const root = issue();
    const middle = childOf(root);
    const leaf = childOf(middle);

    writer.applyTaskPage(sourceId, page({ tasks: [leaf, middle, root] }));

    expect(taskRow(leaf.externalId).parentTaskId).toBe(taskIdOf(middle.externalId));
    expect(taskRow(middle.externalId).parentTaskId).toBe(taskIdOf(root.externalId));
    expect(taskRow(root.externalId).parentTaskId).toBeNull();
  });

  it('a child whose parent is not mirrored is top-level and keeps the parent in metadata', async () => {
    const parent = issue({ key: 'ENG-900', title: 'Someone else’s epic' });
    const child = childOf(parent);

    writer.applyTaskPage(sourceId, page({ tasks: [child] }));

    expect(taskRow(child.externalId).parentTaskId).toBeNull();
    expect(linkOf(child.externalId)!.metadata).toMatchObject({
      parentExternalId: parent.externalId,
      parentKey: 'ENG-900',
      parentTitle: 'Someone else’s epic',
    });
    // listed as an ordinary top-level task
    const page1 = await tasks.listTasks({ excludeSubtasks: true });
    expect(page1.items.map((task) => task.id)).toEqual([taskIdOf(child.externalId)]);
  });

  it('a parent arriving in a later page adopts the children waiting for it', () => {
    const parent = issue();
    const child = childOf(parent);
    const grandchild = childOf(child);
    writer.applyTaskPage(sourceId, page({ tasks: [child, grandchild] }));
    expect(taskRow(child.externalId).parentTaskId).toBeNull();
    expect(taskRow(grandchild.externalId).parentTaskId).toBe(taskIdOf(child.externalId));

    const summary = writer.applyTaskPage(sourceId, page({ tasks: [parent] }));

    expect(summary).toEqual({ inserted: 1, updated: 1, removed: 0, changed: ['task'] });
    expect(taskRow(child.externalId).parentTaskId).toBe(taskIdOf(parent.externalId));
    expect(taskRow(grandchild.externalId).parentTaskId).toBe(taskIdOf(child.externalId));
  });

  it('a restored parent adopts children that arrived while it was removed', () => {
    const parent = issue();
    writer.applyTaskPage(sourceId, page({ tasks: [parent] }));
    writer.removeTasks(sourceId, [parent.externalId]);
    const child = childOf(parent);
    writer.applyTaskPage(sourceId, page({ tasks: [child] }));
    expect(taskRow(child.externalId).parentTaskId).toBeNull();

    writer.applyTaskPage(sourceId, page({ tasks: [parent] }));

    expect(taskRow(child.externalId).parentTaskId).toBe(taskIdOf(parent.externalId));
  });

  it('a sub-issue moved to the top level loses its parent', () => {
    const parent = issue();
    const child = childOf(parent);
    writer.applyTaskPage(sourceId, page({ tasks: [parent, child] }));

    writer.applyTaskPage(
      sourceId,
      page({
        tasks: [
          { ...child, parentExternalId: null, parentKey: null, parentTitle: null, updatedAt: V2 },
        ],
      }),
    );

    expect(taskRow(child.externalId).parentTaskId).toBeNull();
    expect(linkOf(child.externalId)!.metadata).toMatchObject({ parentExternalId: null });
  });
});

describe('SyncWriter — transactions', () => {
  it('a database failure midway through a page rolls the whole page back', () => {
    const proj = project({ title: 'Doomed project' });
    const first = issue({ title: 'Doomed first', projectExternalId: proj.externalId });
    // title is NOT NULL, so this insert fails after the project and the first task are written
    const broken = issue({ title: null as unknown as string });

    expect(() =>
      writer.applyTaskPage(sourceId, page({ projects: [proj], tasks: [first, broken] })),
    ).toThrow();

    expect(count(projectsTable)).toBe(0);
    expect(count(tasksTable)).toBe(0);
    expect(count(externalLinks)).toBe(0);
    expect(searchIds('Doomed')).toEqual([]);
  });

  it('a failure after search writes rolls the index back with the rows', () => {
    const item = issue({ title: 'Indexed then undone' });
    writer.applyTaskPage(sourceId, page({ tasks: [item] }));
    const proj = project({ title: 'Unlucky' });
    // projects and their index entries are written before the tasks fail
    vi.spyOn(search, 'indexTasks').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() =>
      writer.applyTaskPage(
        sourceId,
        page({
          projects: [proj],
          tasks: [{ ...item, title: 'Renamed then undone', updatedAt: V2 }],
          removedIds: [],
        }),
      ),
    ).toThrow('boom');

    expect(count(projectsTable)).toBe(0);
    expect(searchIds('Unlucky')).toEqual([]);
    expect(taskRow(item.externalId).title).toBe('Indexed then undone');
    expect(linkOf(item.externalId)!.externalUpdatedAt).toEqual(V1);
  });

  it('nests inside a caller’s transaction, so the engine can save its cursor with the page', () => {
    const item = issue();

    expect(() =>
      db.transaction(() => {
        writer.applyTaskPage(sourceId, page({ tasks: [item] }));
        throw new Error('cursor save failed');
      }),
    ).toThrow('cursor save failed');

    expect(count(tasksTable)).toBe(0);
    expect(count(externalLinks)).toBe(0);
  });
});
