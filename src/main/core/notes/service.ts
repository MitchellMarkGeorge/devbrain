import { generateId, NoteId } from '@common/ids';
import { notes } from '@main/db/schema/notes';
import { SQL, and, isNull, asc, desc, eq, inArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import path from 'node:path';
import { deleteNoteFile, updateNoteFile, writeNoteFile } from '../local/notes';
import {
  CreateNoteOptions,
  Note,
  NoteFilterOptions,
  NoteSortOptions,
  UpdateNoteOptions,
} from './types';
import { stripMarkdown } from '../shared/markdown';
import { NotFoundError } from '../shared/errors';

export class NoteService {
  private workspaceNotesPath: string;
  constructor(
    private readonly db: BetterSQLite3Database,
    workspacePath: string,
  ) {
    this.workspaceNotesPath = path.join(workspacePath, 'notes');
  }

  async getById(id: NoteId): Promise<Note | null> {
    const [note] = await this.activeNotes(eq(notes.id, id));
    return note ?? null;
  }

  async getByIds(ids: NoteId[]): Promise<Note[]> {
    return this.activeNotes(inArray(notes.id, ids));
  }

  async createNote(options: CreateNoteOptions): Promise<Note> {
    if (options.linkedEventId && options.linkedTaskId) {
      throw Error('Notes cannot be linked to both an event and a task');
    }

    const newNoteId = generateId('note');
    const filePath = this.noteFilePath(newNoteId);
    const title = options.title ?? '';

    // write the file first then update the DB
    await writeNoteFile(filePath, { id: newNoteId, title }, '');

    const newNote = {
      id: newNoteId,
      title,
      projectId: options.projectId ?? null,
      filePath,
      // either, not both
      linkedTaskId: options.linkedTaskId ?? null,
      linkedEventId: options.linkedEventId ?? null,
    };

    try {
      const [insertedNote] = await this.db.insert(notes).values(newNote).returning();
      return insertedNote;
    } catch (err) {
      // undo the file write
      await deleteNoteFile(filePath);
      throw err;
    }
  }

  async listNotes(
    filter: NoteFilterOptions = {},
    sort: NoteSortOptions = { sortBy: 'lastUpdated' },
  ) {
    const clauses = [isNull(notes.archivedAt)];

    if (filter.projectId !== undefined) {
      clauses.push(
        filter.projectId === null ? isNull(notes.projectId) : eq(notes.projectId, filter.projectId),
      );
    }

    if (filter.linkedEventId !== undefined) {
      clauses.push(
        filter.linkedEventId === null
          ? isNull(notes.linkedEventId)
          : eq(notes.linkedEventId, filter.linkedEventId),
      );
    }

    if (filter.linkedTaskId !== undefined) {
      clauses.push(
        filter.linkedTaskId === null
          ? isNull(notes.linkedTaskId)
          : eq(notes.linkedTaskId, filter.linkedTaskId),
      );
    }

    let orderColunm: SQLiteColumn;
    switch (sort.sortBy) {
      case 'title':
        orderColunm = notes.title;
        break;
      case 'created':
        orderColunm = notes.createdAt;
        break;
      case 'lastUpdated':
        orderColunm = notes.updatedAt;
        break;
    }

    const order = sort.direction === 'asc' ? asc(orderColunm) : desc(orderColunm);

    return this.db
      .select()
      .from(notes)
      .where(and(...clauses))
      .orderBy(order)
      .all();
  }

  async updateNote(id: NoteId, options: UpdateNoteOptions): Promise<Note | null> {
    if (options.linkedEventId && options.linkedTaskId) {
      throw Error('Notes cannot be linked to both an event and a task');
    }

    const updates: UpdateNoteOptions = {};
    if (options.title !== undefined) updates.title = options.title;
    if (options.projectId !== undefined) updates.projectId = options.projectId;
    if (options.linkedEventId !== undefined) updates.linkedEventId = options.linkedEventId;
    if (options.linkedTaskId !== undefined) updates.linkedTaskId = options.linkedTaskId;

    const [updatedNote] = await this.db
      .update(notes)
      .set(updates)
      .where(eq(notes.id, id))
      .returning();
    return updatedNote ?? null;
  }

  async updateNoteContent(id: NoteId, content: string): Promise<Note> {
    // think about this, could just pass in the title or the note object itself
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError(id);

    const preview = stripMarkdown(content.trim()).slice(0, 200);

    await updateNoteFile(this.noteFilePath(id), { id, title: existing.title }, content);

    const [updatedNote] = await this.db
      .update(notes)
      .set({
        preview: preview || null,
      })
      .where(eq(notes.id, id))
      .returning();

    return updatedNote;
  }

  private noteFilePath(id: NoteId): string {
    return path.join(this.workspaceNotesPath, `${id}.md`);
  }

  private activeNotes(condition: SQL<unknown>) {
    // automatically filters out archived notes
    return (
      this.db
        .select()
        .from(notes)
        .where(and(condition, isNull(notes.archivedAt)))
        // by default sort by created at (come back to this)
        .orderBy(desc(notes.createdAt))
    );
  }
}
