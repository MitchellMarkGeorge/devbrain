import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NoteId, TaskId, WorkspaceId } from '@common/ids';
import type { MentionTargetId, WorkspaceInfo } from '@common/types';
import { mentions } from '@main/db/schema/mentions';
import { notes as notesTable } from '@main/db/schema/notes';
import { projects as projectsTable } from '@main/db/schema/projects';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';
import { Workspace } from '../../workspace/workspace';
import type { MentionChange } from '../../mentions/service';
import { WORKSPACE_OPTIONS } from '../utils';

let tmpDir: string;
let workspace: Workspace;
let changes: MentionChange[];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-mentions-'));
  const info: WorkspaceInfo = {
    id: 'wsp_mentions' as WorkspaceId,
    name: 'Mentions',
    color: '#000000',
    path: tmpDir,
    createdAt: Date.now(),
    lastOpenedAt: null,
    lastPage: null,
  };
  workspace = await Workspace.create(info, WORKSPACE_OPTIONS);
  changes = [];
  workspace.mentions.onChange((change) => changes.push(change));
});

afterEach(async () => {
  await workspace.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const link = (type: string, id: string, label = 'it') => `[${label}](devbrain://${type}/${id})`;

// what mentions `id`, as [source id, contextBefore, contextAfter]
const mentionsOf = (id: MentionTargetId) =>
  workspace.mentions.list(id).map((m) => [m.source.id, m.contextBefore, m.contextAfter]);

describe('MentionService', () => {
  it('indexes a note as it is created and saved', async () => {
    const target = workspace.tasks.createTask({ title: 'PKCE' });
    const note = await workspace.notes.createNote({
      title: 'ADR',
      content: `Carried out by ${link('task', target.id)} soon`,
    });
    expect(mentionsOf(target.id)).toEqual([[note.id, 'Carried out by ', ' soon']]);
    expect(changes).toEqual([{ type: 'changed', targetIds: [target.id] }]);

    await workspace.notes.updateNoteContent(note.id, 'No links now');
    expect(mentionsOf(target.id)).toEqual([]);
  });

  it('describes the source as its row shows it, most recently changed first', async () => {
    const target = await workspace.notes.createNote({ title: 'ADR' });
    const task = workspace.tasks.createTask({
      title: 'PKCE',
      description: `Follow ${link('note', target.id)}`,
    });
    const project = workspace.projects.createProject({
      title: 'Auth',
      description: `See ${link('note', target.id)}`,
    });
    const event = workspace.events.createEvent({
      title: 'Review',
      startAt: new Date(Date.now() + 3_600_000),
      endAt: new Date(Date.now() + 7_200_000),
    });
    const eventNote = await workspace.notes.createNote({
      title: 'Review notes',
      linkedEventId: event.id,
      content: `Sign off ${link('note', target.id)} twice ${link('note', target.id)}`,
    });

    // a new row's updatedAt is stamped to the second, so the order is set here
    stampUpdatedAt(tasksTable, task.id, 1_000);
    stampUpdatedAt(projectsTable, project.id, 2_000);
    stampUpdatedAt(notesTable, eventNote.id, 3_000);

    const list = workspace.mentions.list(target.id);
    expect(list.map((m) => m.source)).toEqual([
      { type: 'note', id: eventNote.id, title: 'Review notes', linkedEventId: event.id },
      { type: 'project', id: project.id, title: 'Auth', color: project.color },
      { type: 'task', id: task.id, title: 'PKCE', status: task.status },
    ]);
    expect(list[0].count).toBe(2);
    expect(workspace.mentions.count(target.id)).toBe(3);
  });

  it('re-indexes a description on update, and announces only what changed', () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const task = workspace.tasks.createTask({ title: 'Source' });
    changes = [];

    workspace.tasks.updateTask(task.id, { description: `Blocked on ${link('task', target.id)}` });
    expect(mentionsOf(target.id)).toEqual([[task.id, 'Blocked on ', '']]);
    expect(changes).toEqual([{ type: 'changed', targetIds: [target.id] }]);

    // a change that leaves the description's links as they were announces nothing
    workspace.tasks.updateTask(task.id, { title: 'Renamed' });
    expect(changes).toHaveLength(1);
  });

  it("leaves out an item's links to itself", () => {
    const task = workspace.tasks.createTask({ title: 'Self' });
    workspace.tasks.updateTask(task.id, { description: link('task', task.id) });
    expect(workspace.mentions.list(task.id)).toEqual([]);
  });

  it('hides a trashed source until it is restored, without re-indexing', async () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const note = await workspace.notes.createNote({ content: link('task', target.id) });

    workspace.archive.archiveNote(note.id);
    expect(mentionsOf(target.id)).toEqual([]);
    workspace.archive.restoreNote(note.id);
    expect(mentionsOf(target.id)).toEqual([[note.id, '', '']]);
  });

  it('drops a deleted item’s rows, as source and as target', async () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const note = await workspace.notes.createNote({ content: link('task', target.id) });
    const source = workspace.tasks.createTask({
      title: 'Source',
      description: link('note', note.id),
    });

    workspace.archive.archiveNote(note.id);
    await workspace.notes.deleteNote(note.id);
    expect(mentionsOf(target.id)).toEqual([]);
    expect(rowsOf(source.id)).toEqual([]);

    const other = workspace.tasks.createTask({
      title: 'Other',
      description: link('task', target.id),
    });
    workspace.archive.archiveTask(other.id);
    changes = [];
    workspace.tasks.deleteTask(other.id);
    expect(mentionsOf(target.id)).toEqual([]);
    expect(changes).toEqual([{ type: 'changed', targetIds: [target.id] }]);
  });

  it('drops the rows of what emptying the trash deletes', async () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const source = workspace.tasks.createTask({
      title: 'Source',
      description: link('task', target.id),
    });
    workspace.archive.archiveTask(source.id);
    await workspace.archive.emptyTrash();
    expect(rowsOf(source.id)).toEqual([]);
  });

  it('rebuilds from descriptions and note files, keeping what a save indexed meanwhile', async () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const task = workspace.tasks.createTask({ title: 'T', description: link('task', target.id) });
    const note = await workspace.notes.createNote({ content: link('task', target.id) });
    const trashed = await workspace.notes.createNote({ content: link('task', target.id) });
    workspace.archive.archiveNote(trashed.id);
    clearIndex();

    const rebuilt = workspace.mentions.rebuild();
    // saved while the files are read: the rebuild must keep this, not what it read
    await workspace.notes.updateNoteContent(note.id, `Now ${link('task', target.id)}`);
    expect(await rebuilt).toBe(3);

    expect(mentionsOf(target.id)).toEqual(
      expect.arrayContaining([
        [task.id, '', ''],
        [note.id, 'Now ', ''],
      ]),
    );
    // the trashed note was indexed too, so restoring it shows it at once
    workspace.archive.restoreNote(trashed.id);
    expect(workspace.mentions.count(target.id)).toBe(3);
  });

  it('builds the index once, when the workspace starts and it never was', async () => {
    const target = workspace.tasks.createTask({ title: 'Target' });
    const note = await workspace.notes.createNote({ content: link('task', target.id) });
    clearIndex();
    expect(workspace.mentions.isBuilt()).toBe(false);

    workspace.startMentions();
    await workspace.mentions.whenIdle();
    expect(workspace.mentions.isBuilt()).toBe(true);
    expect(mentionsOf(target.id)).toEqual([[note.id, '', '']]);

    // built: a later start reads nothing, even with no mentions left at all
    clearIndex();
    const read = vi.spyOn(workspace.notes, 'readContent');
    workspace.startMentions();
    await workspace.mentions.whenIdle();
    expect(read).not.toHaveBeenCalled();
    expect(mentionsOf(target.id)).toEqual([]);
  });
});

function stampUpdatedAt(
  table: typeof tasksTable | typeof projectsTable | typeof notesTable,
  id: string,
  ms: number,
) {
  dbOf(workspace)
    .update(table)
    .set({ updatedAt: new Date(ms) })
    .where(eq(table.id, id as never))
    .run();
}

// drops every mention row; whether the index was built (index_builds) is left as it is
function clearIndex() {
  dbOf(workspace).delete(mentions).run();
}

function rowsOf(sourceId: TaskId | NoteId) {
  return dbOf(workspace)
    .select()
    .from(mentions)
    .all()
    .filter((row) => row.sourceId === sourceId);
}

// the workspace's database, for checking and clearing the index directly
function dbOf(ws: Workspace) {
  return (ws as unknown as { db: import('drizzle-orm/better-sqlite3').BetterSQLite3Database }).db;
}
