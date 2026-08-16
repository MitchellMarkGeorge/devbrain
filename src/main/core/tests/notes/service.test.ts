import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '@common/ids';
import { NoteService } from '../../notes/service';
import { ArchiveService } from '../../archive/service';
import { NotFoundError } from '../../shared/errors';
import { fileExists } from '../../local/utils';
import { readNoteFile } from '../../local/notes';
import { notes as notesTable } from '@main/db/schema/notes';

const MIGRATIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);

const FAKE_PROJECT_ID = generateId('project');
const FAKE_OTHER_PROJECT_ID = generateId('project');
const FAKE_EVENT_ID = generateId('event');
const FAKE_TASK_ID = generateId('task');

function createDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRATIONS_PATH });
  // fake foreign-key ids are used below without seeding parent tables
  sqlite.pragma('foreign_keys = OFF');
  return db;
}

function notesFilePath(workspacePath: string, id: string): string {
  return path.join(workspacePath, 'notes', `${id}.md`);
}

let db: BetterSQLite3Database;
let workspacePath: string;
let notesService: NoteService;
let archive: ArchiveService;

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-notes-service-'));
  notesService = new NoteService(db, workspacePath);
  archive = new ArchiveService(db);
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('NoteService — createNote', () => {
  it('creates a note row and a backing file with matching id and title', async () => {
    const note = await notesService.createNote({ title: 'My note' });

    expect(note.id).toBeTruthy();
    expect(note.title).toBe('My note');

    const filePath = notesFilePath(workspacePath, note.id);
    expect(await fileExists(filePath)).toBe(true);

    const fileData = await readNoteFile(filePath);
    expect(fileData.id).toBe(note.id);
    expect(fileData.title).toBe('My note');
  });

  it('defaults title to an empty string when not provided', async () => {
    const note = await notesService.createNote({});
    expect(note.title).toBe('');
  });

  it('creates the backing file with empty content', async () => {
    const note = await notesService.createNote({ title: 'Empty' });
    const fileData = await readNoteFile(notesFilePath(workspacePath, note.id));
    expect(fileData.content).toBe('');
  });

  it('stores the provided projectId', async () => {
    const note = await notesService.createNote({ projectId: FAKE_PROJECT_ID });
    expect(note.projectId).toBe(FAKE_PROJECT_ID);
  });

  it('defaults projectId to null when not provided', async () => {
    const note = await notesService.createNote({});
    expect(note.projectId).toBeNull();
  });

  it('stores a provided linkedEventId', async () => {
    const note = await notesService.createNote({ linkedEventId: FAKE_EVENT_ID });
    expect(note.linkedEventId).toBe(FAKE_EVENT_ID);
    expect(note.linkedTaskId).toBeNull();
  });

  it('stores a provided linkedTaskId', async () => {
    const note = await notesService.createNote({ linkedTaskId: FAKE_TASK_ID });
    expect(note.linkedTaskId).toBe(FAKE_TASK_ID);
    expect(note.linkedEventId).toBeNull();
  });

  it('throws if both linkedEventId and linkedTaskId are provided, without creating a file', async () => {
    const eventId = generateId('event');
    const taskId = generateId('task');

    await expect(
      notesService.createNote({ linkedEventId: eventId, linkedTaskId: taskId }),
    ).rejects.toThrow(/cannot be linked to both/i);

    // the notes directory should never have been created
    const notesDir = path.join(workspacePath, 'notes');
    await expect(fs.readdir(notesDir)).rejects.toThrow();
  });

  it('cleans up the file it wrote if the DB insert fails', async () => {
    // linkedTaskId is unique, so a second note pointed at the same task
    // will fail at the DB layer after its file has already been written
    const taskId = generateId('task');
    await notesService.createNote({ linkedTaskId: taskId });

    await expect(notesService.createNote({ linkedTaskId: taskId })).rejects.toThrow();

    const notesDir = path.join(workspacePath, 'notes');
    const entries = await fs.readdir(notesDir);
    expect(entries).toHaveLength(1);
  });
});

describe('NoteService — getById', () => {
  it('returns the note for a valid id', async () => {
    const created = await notesService.createNote({ title: 'Find me' });
    const found = await notesService.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe('Find me');
  });

  it('returns null for an unknown id', async () => {
    const result = await notesService.getById(generateId('note'));
    expect(result).toBeNull();
  });

  it('returns null for an archived note', async () => {
    const note = await notesService.createNote({ title: 'Will be archived' });
    await archive.archiveNote(note.id);
    const result = await notesService.getById(note.id);
    expect(result).toBeNull();
  });
});

describe('NoteService — getByIds', () => {
  it('returns all notes matching the provided ids', async () => {
    const a = await notesService.createNote({ title: 'A' });
    const b = await notesService.createNote({ title: 'B' });
    await notesService.createNote({ title: 'C' }); // not requested
    const result = await notesService.getByIds([a.id, b.id]);
    expect(result).toHaveLength(2);
    const ids = result.map((n) => n.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('returns an empty array when none of the ids match', async () => {
    const result = await notesService.getByIds([generateId('note'), generateId('note')]);
    expect(result).toHaveLength(0);
  });

  it('excludes archived notes even when their id is requested', async () => {
    const note = await notesService.createNote({ title: 'Archived' });
    await archive.archiveNote(note.id);
    const result = await notesService.getByIds([note.id]);
    expect(result).toHaveLength(0);
  });
});

describe('NoteService — listNotes', () => {
  it('returns all non-archived notes by default', async () => {
    const a = await notesService.createNote({ title: 'A' });
    const b = await notesService.createNote({ title: 'B' });
    const archived = await notesService.createNote({ title: 'Archived' });
    await archive.archiveNote(archived.id);

    const result = await notesService.listNotes();
    const ids = result.map((n) => n.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(archived.id);
  });

  it('filter.projectId returns only notes in that project', async () => {
    const inProject = await notesService.createNote({
      title: 'In project',
      projectId: FAKE_PROJECT_ID,
    });
    await notesService.createNote({ title: 'No project' });
    const result = await notesService.listNotes({ projectId: FAKE_PROJECT_ID });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(inProject.id);
  });

  it('filter.projectId: null returns only notes without a project', async () => {
    await notesService.createNote({ title: 'In project', projectId: FAKE_PROJECT_ID });
    const noProject = await notesService.createNote({ title: 'No project' });
    const result = await notesService.listNotes({ projectId: null });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(noProject.id);
  });

  it('filter.linkedEventId returns only notes linked to that event', async () => {
    const linked = await notesService.createNote({
      title: 'Linked',
      linkedEventId: FAKE_EVENT_ID,
    });
    await notesService.createNote({ title: 'Unlinked' });
    const result = await notesService.listNotes({ linkedEventId: FAKE_EVENT_ID });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(linked.id);
  });

  it('filter.linkedEventId: null returns only notes without a linked event', async () => {
    await notesService.createNote({ title: 'Linked', linkedEventId: FAKE_EVENT_ID });
    const unlinked = await notesService.createNote({ title: 'Unlinked' });
    const result = await notesService.listNotes({ linkedEventId: null });
    expect(result.map((n) => n.id)).toContain(unlinked.id);
  });

  it('filter.linkedTaskId returns only notes linked to that task', async () => {
    const linked = await notesService.createNote({ title: 'Linked', linkedTaskId: FAKE_TASK_ID });
    await notesService.createNote({ title: 'Unlinked' });
    const result = await notesService.listNotes({ linkedTaskId: FAKE_TASK_ID });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(linked.id);
  });

  it('filter.linkedTaskId: null returns only notes without a linked task', async () => {
    await notesService.createNote({ title: 'Linked', linkedTaskId: FAKE_TASK_ID });
    const unlinked = await notesService.createNote({ title: 'Unlinked' });
    const result = await notesService.listNotes({ linkedTaskId: null });
    expect(result.map((n) => n.id)).toContain(unlinked.id);
  });

  it('defaults to sorting by lastUpdated descending', async () => {
    const a = await notesService.createNote({ title: 'A' });
    const b = await notesService.createNote({ title: 'B' });
    await notesService.updateNote(a.id, { title: 'A updated' });
    const result = await notesService.listNotes();
    const ids = result.map((n) => n.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('sort=created orders by createdAt descending', async () => {
    const first = await notesService.createNote({ title: 'First' });
    const second = await notesService.createNote({ title: 'Second' });

    // the DB's createdAt default only has whole-second resolution, so two
    // notes created back-to-back in a test can tie — pin explicit, distinct
    // timestamps to make the ordering assertion deterministic
    await db
      .update(notesTable)
      .set({ createdAt: new Date('2024-01-01') })
      .where(eq(notesTable.id, first.id));
    await db
      .update(notesTable)
      .set({ createdAt: new Date('2024-01-02') })
      .where(eq(notesTable.id, second.id));

    const result = await notesService.listNotes({}, { sortBy: 'created' });
    expect(result[0].id).toBe(second.id);
    expect(result[result.length - 1].id).toBe(first.id);
  });

  it('sort=title orders alphabetically ascending when direction=asc', async () => {
    await notesService.createNote({ title: 'Banana' });
    await notesService.createNote({ title: 'Apple' });
    await notesService.createNote({ title: 'Cherry' });
    const result = await notesService.listNotes({}, { sortBy: 'title', direction: 'asc' });
    expect(result.map((n) => n.title)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('direction defaults to desc for sort=title', async () => {
    await notesService.createNote({ title: 'Banana' });
    await notesService.createNote({ title: 'Apple' });
    const result = await notesService.listNotes({}, { sortBy: 'title' });
    expect(result[0].title).toBe('Banana');
  });

  it('excludes archived notes regardless of filter', async () => {
    const note = await notesService.createNote({
      title: 'Will archive',
      projectId: FAKE_PROJECT_ID,
    });
    await archive.archiveNote(note.id);
    const result = await notesService.listNotes({ projectId: FAKE_PROJECT_ID });
    expect(result.map((n) => n.id)).not.toContain(note.id);
  });

  it('combines filter and sort correctly', async () => {
    const b = await notesService.createNote({ title: 'B', projectId: FAKE_PROJECT_ID });
    const a = await notesService.createNote({ title: 'A', projectId: FAKE_PROJECT_ID });
    await notesService.createNote({ title: 'Other project', projectId: FAKE_OTHER_PROJECT_ID });

    const result = await notesService.listNotes(
      { projectId: FAKE_PROJECT_ID },
      { sortBy: 'title', direction: 'asc' },
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(a.id);
    expect(result[1].id).toBe(b.id);
  });
});

describe('NoteService — updateNote', () => {
  it('updates the title', async () => {
    const note = await notesService.createNote({ title: 'Old title' });
    const updated = await notesService.updateNote(note.id, { title: 'New title' });
    expect(updated!.title).toBe('New title');
  });

  it('updates the projectId', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNote(note.id, { projectId: FAKE_PROJECT_ID });
    expect(updated!.projectId).toBe(FAKE_PROJECT_ID);
  });

  it('clears the projectId when explicitly set to null', async () => {
    const note = await notesService.createNote({ title: 'Note', projectId: FAKE_PROJECT_ID });
    const updated = await notesService.updateNote(note.id, { projectId: null });
    expect(updated!.projectId).toBeNull();
  });

  it('persists fields that were not passed', async () => {
    const note = await notesService.createNote({ title: 'Original', projectId: FAKE_PROJECT_ID });
    const updated = await notesService.updateNote(note.id, { title: 'Changed' });
    expect(updated!.projectId).toBe(FAKE_PROJECT_ID);
  });

  it('sets linkedEventId', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNote(note.id, { linkedEventId: FAKE_EVENT_ID });
    expect(updated!.linkedEventId).toBe(FAKE_EVENT_ID);
  });

  it('sets linkedTaskId', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNote(note.id, { linkedTaskId: FAKE_TASK_ID });
    expect(updated!.linkedTaskId).toBe(FAKE_TASK_ID);
  });

  it('does not clear an existing link when updating an unrelated field', async () => {
    const note = await notesService.createNote({ title: 'Note', linkedEventId: FAKE_EVENT_ID });
    const updated = await notesService.updateNote(note.id, { title: 'Renamed' });
    expect(updated!.linkedEventId).toBe(FAKE_EVENT_ID);
  });

  it('clears an existing link when explicitly set to null', async () => {
    const note = await notesService.createNote({ title: 'Note', linkedEventId: FAKE_EVENT_ID });
    const updated = await notesService.updateNote(note.id, { linkedEventId: null });
    expect(updated!.linkedEventId).toBeNull();
  });

  it('throws if both linkedEventId and linkedTaskId are provided', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    await expect(
      notesService.updateNote(note.id, {
        linkedEventId: FAKE_EVENT_ID,
        linkedTaskId: FAKE_TASK_ID,
      }),
    ).rejects.toThrow(/cannot be linked to both/i);
  });

  it('returns null for an unknown id', async () => {
    const result = await notesService.updateNote(generateId('note'), { title: 'Ghost' });
    expect(result).toBeNull();
  });
});

describe('NoteService — updateNoteContent', () => {
  it('writes the new content to the backing file', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    await notesService.updateNoteContent(note.id, 'Hello world');

    const fileData = await readNoteFile(notesFilePath(workspacePath, note.id));
    expect(fileData.content).toBe('Hello world');
  });

  it('preserves the title in the backing file', async () => {
    const note = await notesService.createNote({ title: 'Keep me' });
    await notesService.updateNoteContent(note.id, 'New content');

    const fileData = await readNoteFile(notesFilePath(workspacePath, note.id));
    expect(fileData.title).toBe('Keep me');
  });

  it('derives a plain-text preview from markdown content', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNoteContent(
      note.id,
      '# Heading\n\nSome **bold** text',
    );
    expect(updated.preview).toBe('Heading\n\nSome bold text');
  });

  it('truncates the preview to 200 characters', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const longContent = 'a'.repeat(300);
    const updated = await notesService.updateNoteContent(note.id, longContent);
    expect(updated.preview).toHaveLength(200);
  });

  it('sets preview to null for empty content', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNoteContent(note.id, '');
    expect(updated.preview).toBeNull();
  });

  it('sets preview to null for whitespace-only content', async () => {
    const note = await notesService.createNote({ title: 'Note' });
    const updated = await notesService.updateNoteContent(note.id, '   \n  ');
    expect(updated.preview).toBeNull();
  });

  it('does not change projectId or links', async () => {
    const note = await notesService.createNote({
      title: 'Note',
      projectId: FAKE_PROJECT_ID,
      linkedEventId: FAKE_EVENT_ID,
    });
    const updated = await notesService.updateNoteContent(note.id, 'New content');
    expect(updated.projectId).toBe(FAKE_PROJECT_ID);
    expect(updated.linkedEventId).toBe(FAKE_EVENT_ID);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(
      notesService.updateNoteContent(generateId('note'), 'content'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ArchiveService — archiveNote', () => {
  it('sets archivedAt to a recent timestamp', async () => {
    const note = await notesService.createNote({ title: 'To archive' });
    const before = new Date();
    const archived = await archive.archiveNote(note.id);
    const after = new Date();
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(archived.archivedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns the updated note row', async () => {
    const note = await notesService.createNote({ title: 'Archivable' });
    const result = await archive.archiveNote(note.id);
    expect(result.id).toBe(note.id);
    expect(result.title).toBe('Archivable');
  });

  it('archived note is no longer returned by NoteService.getById', async () => {
    const note = await notesService.createNote({ title: 'Gone' });
    await archive.archiveNote(note.id);
    expect(await notesService.getById(note.id)).toBeNull();
  });

  it('archived note is excluded from NoteService.listNotes', async () => {
    const note = await notesService.createNote({ title: 'Gone', projectId: FAKE_PROJECT_ID });
    await archive.archiveNote(note.id);
    const result = await notesService.listNotes({ projectId: FAKE_PROJECT_ID });
    expect(result.map((n) => n.id)).not.toContain(note.id);
  });

  it('leaves the note file on disk untouched', async () => {
    const note = await notesService.createNote({ title: 'Still on disk' });
    await archive.archiveNote(note.id);
    expect(await fileExists(notesFilePath(workspacePath, note.id))).toBe(true);
  });
});

describe('ArchiveService — restoreNote', () => {
  it('clears archivedAt on the note', async () => {
    const note = await notesService.createNote({ title: 'Restore me' });
    await archive.archiveNote(note.id);
    const restored = await archive.restoreNote(note.id);
    expect(restored.archivedAt).toBeNull();
  });

  it('returns the updated note row', async () => {
    const note = await notesService.createNote({ title: 'Restore me' });
    await archive.archiveNote(note.id);
    const result = await archive.restoreNote(note.id);
    expect(result.id).toBe(note.id);
    expect(result.title).toBe('Restore me');
  });

  it('restored note is visible via NoteService.getById', async () => {
    const note = await notesService.createNote({ title: 'Restored' });
    await archive.archiveNote(note.id);
    await archive.restoreNote(note.id);
    const found = await notesService.getById(note.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(note.id);
  });

  it('restored note appears in NoteService.listNotes', async () => {
    const note = await notesService.createNote({ title: 'Restored', projectId: FAKE_PROJECT_ID });
    await archive.archiveNote(note.id);
    await archive.restoreNote(note.id);
    const result = await notesService.listNotes({ projectId: FAKE_PROJECT_ID });
    expect(result.map((n) => n.id)).toContain(note.id);
  });
});
