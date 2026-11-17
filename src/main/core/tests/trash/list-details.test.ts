import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExternalSourceId, ProjectId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import {
  AuthType,
  LinkState,
  ProjectStatus,
  Provider,
  SourceType,
  TaskStatus,
  type TrashedEntity,
} from '@common/types';
import { createDb } from '../utils';
import { TrashService } from '../../trash/service';
import { NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { NotFoundError } from '../../shared/errors';

// What each Trash row carries beyond the trash's own columns (trash.listTrashed): a task's
// status, project and link, a project's status, colour and link, a note's preview and project;
// and the trashed project and note read by id (getById's includeTrashed, readContent).

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);
const SYNCED_AT = new Date('2026-10-01T12:00:00Z');

let db: BetterSQLite3Database;
let trash: TrashService;
let tasks: TaskService;
let projects: ProjectService;
let notes: NoteService;
let workspacePath: string;
let sourceId: ExternalSourceId;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-trash-rows-'));
  await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });
  trash = new TrashService(db);
  tasks = new TaskService(db);
  projects = new ProjectService(db, new TaskService(db));
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

// a detached link (the user's own copy of a Linear item), so the row can be trashed
function link(entity: { taskId: TaskId } | { projectId: ProjectId }, key: string) {
  db.insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      state: LinkState.DETACHED,
      externalId: key,
      externalKey: key,
      externalUrl: `https://linear.app/acme/issue/${key}`,
      externalUpdatedAt: SYNCED_AT,
      lastSyncedAt: SYNCED_AT,
      ...entity,
    })
    .run();
}

function byId(items: TrashedEntity[]): Map<string, TrashedEntity> {
  return new Map(items.map((item) => [item.id as string, item]));
}

describe('TrashService.listTrashed — each kind’s fields', () => {
  it('gives a task its status, project and link; a project its status, colour and link; a note its preview and project', async () => {
    const project = projects.createProject({ title: 'Gateway', color: '#f59e0b' });
    const summary = { id: project.id, title: 'Gateway', color: '#f59e0b' };
    const task = tasks.createTask({
      title: 'Set up',
      dueDate: TOMORROW,
      projectId: project.id,
      status: TaskStatus.IN_PROGRESS,
    });
    link({ taskId: task.id }, 'ENG-102');
    const note = await notes.createNote({
      title: 'Retro',
      projectId: project.id,
      content: 'What went well.\n\nAnd what to change.',
    });
    const other = projects.createProject({ title: 'Other', status: ProjectStatus.ON_HOLD });
    link({ projectId: other.id }, 'PRJ-7');
    const loose = tasks.createTask({ title: 'Loose', dueDate: TOMORROW });

    trash.trashTask(task.id);
    trash.trashNote(note.id);
    trash.trashProject(other.id);
    trash.trashTask(loose.id);

    const rows = byId(trash.listTrashed().items);
    expect(rows.get(task.id)).toEqual({
      id: task.id,
      entityType: 'tasks',
      title: 'Set up',
      trashedAt: expect.any(Date),
      status: TaskStatus.IN_PROGRESS,
      project: summary,
      external: expect.objectContaining({
        provider: Provider.LINEAR,
        state: LinkState.DETACHED,
        key: 'ENG-102',
      }),
    });
    expect(rows.get(loose.id)).toMatchObject({ project: null, external: null });
    expect(rows.get(other.id)).toEqual({
      id: other.id,
      entityType: 'projects',
      title: 'Other',
      trashedAt: expect.any(Date),
      status: ProjectStatus.ON_HOLD,
      color: null,
      external: expect.objectContaining({ key: 'PRJ-7' }),
    });
    expect(rows.get(note.id)).toEqual({
      id: note.id,
      entityType: 'notes',
      title: 'Retro',
      trashedAt: expect.any(Date),
      preview: notes.getById(note.id, { includeTrashed: true }).preview,
      project: summary,
    });
    expect(rows.get(note.id)).toMatchObject({ preview: expect.stringContaining('What went well') });
  });

  it('names the project of a task and a note trashed with it', async () => {
    const project = projects.createProject({ title: 'Gateway', color: '#f59e0b' });
    const task = tasks.createTask({ title: 'Set up', dueDate: TOMORROW, projectId: project.id });
    const note = await notes.createNote({ title: 'Plan', projectId: project.id });
    trash.trashProject(project.id);

    const rows = byId(trash.listTrashed().items);
    const summary = { id: project.id, title: 'Gateway', color: '#f59e0b' };
    expect(rows.get(task.id)).toMatchObject({ project: summary });
    expect(rows.get(note.id)).toMatchObject({ project: summary });
  });

  it('fills one kind’s list, and every page of a paged one', async () => {
    const project = projects.createProject({ title: 'P', color: '#22c55e' });
    trash.trashProject(project.id);
    for (let i = 0; i < 3; i++) {
      trash.trashTask(tasks.createTask({ title: `T${i}`, dueDate: TOMORROW }).id);
    }

    expect(trash.listTrashed({ entityType: 'projects' }).items).toEqual([
      expect.objectContaining({ id: project.id, color: '#22c55e', status: project.status }),
    ]);
    let cursor: string | undefined;
    const seen: TrashedEntity[] = [];
    do {
      const page = trash.listTrashed({}, { limit: 2, cursor });
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(4);
    for (const row of seen) {
      expect(row).toHaveProperty(row.entityType === 'tasks' ? 'status' : 'color');
    }
  });

  it('reads a page’s fields with the same few queries however many rows it has', async () => {
    const client = (db as typeof db & { $client: Database.Database }).$client;
    const countQueries = (run: () => void) => {
      const prepare = vi.spyOn(client, 'prepare');
      run();
      const count = prepare.mock.calls.length;
      prepare.mockRestore();
      return count;
    };
    const trashSome = async (count: number) => {
      for (let i = 0; i < count; i++) {
        const project = projects.createProject({ title: `P${i}` });
        const task = tasks.createTask({ title: `T${i}`, dueDate: TOMORROW, projectId: project.id });
        link({ taskId: task.id }, `ENG-${count}-${i}`);
        await notes.createNote({ title: `N${i}`, projectId: project.id });
        trash.trashProject(project.id);
      }
    };

    await trashSome(1);
    const few = countQueries(() => trash.listTrashed({}, { limit: 100 }));
    await trashSome(10);
    const many = countQueries(() => trash.listTrashed({}, { limit: 100 }));
    expect(trash.listTrashed({}, { limit: 100 }).items).toHaveLength(33);
    expect(many).toBe(few);
  });
});

describe('a trashed project and note, read by id', () => {
  it('finds a trashed project only with includeTrashed', () => {
    const project = projects.createProject({ title: 'Gone' });
    trash.trashProject(project.id);

    expect(() => projects.getById(project.id)).toThrow(NotFoundError);
    expect(projects.getById(project.id, { includeTrashed: true })).toMatchObject({
      id: project.id,
      trashedAt: expect.any(Date),
      external: null,
    });
    // writes still refuse it, so its page stays read-only
    expect(() => projects.getProjectStats(project.id)).toThrow(NotFoundError);
  });

  it('finds a trashed note and reads its file only with includeTrashed', async () => {
    const note = await notes.createNote({ title: 'Gone', content: 'Body text' });
    trash.trashNote(note.id);

    expect(() => notes.getById(note.id)).toThrow(NotFoundError);
    expect(notes.getById(note.id, { includeTrashed: true })).toMatchObject({
      id: note.id,
      trashedAt: expect.any(Date),
    });
    await expect(notes.readContent(note.id)).rejects.toThrow(NotFoundError);
    await expect(notes.readContent(note.id, { includeTrashed: true })).resolves.toContain(
      'Body text',
    );
    await expect(notes.updateNoteContent(note.id, 'Changed')).rejects.toThrow(NotFoundError);
  });

  it('still refuses an unknown id with includeTrashed', async () => {
    expect(() => projects.getById('prj_missing' as ProjectId, { includeTrashed: true })).toThrow(
      NotFoundError,
    );
    await expect(
      notes.readContent('nte_missing' as never, { includeTrashed: true }),
    ).rejects.toThrow(NotFoundError);
  });
});
