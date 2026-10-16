import { generateId, NoteId } from '@common/ids';
import { notes } from '@main/db/schema/notes';
import { SQL, and, isNull, desc, eq, inArray } from 'drizzle-orm';
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
import { InvalidInputError, NotFoundError } from '../shared/errors';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { ChangeListener, ChangeListeners } from '../shared/changes';

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after both the note's file and its row are written,
// with the row as written. `content` is the note's new markdown when the write changed it; a write
// that leaves the body alone (a rename, a new project or link) has none.
export type NoteChange =
  | { type: 'created'; note: Note; content: string }
  | { type: 'updated'; note: Note; content?: string };

export class NoteService {
  private workspaceNotesPath: string;
  private readonly changes = new ChangeListeners<NoteChange>('Note');
  // the tail of each note's queue of content saves, removed once the queue drains
  private readonly contentSaves = new Map<NoteId, Promise<Note>>();

  constructor(
    private readonly db: BetterSQLite3Database,
    workspacePath: string,
  ) {
    this.workspaceNotesPath = path.join(workspacePath, 'notes');
  }

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<NoteChange>): () => void {
    return this.changes.add(listener);
  }

  async getById(id: NoteId): Promise<Note> {
    const [note] = await this.activeNotes(eq(notes.id, id));
    if (!note) throw new NotFoundError(id);
    return note;
  }

  async getByIds(ids: NoteId[]): Promise<Note[]> {
    return this.activeNotes(inArray(notes.id, ids));
  }

  async createNote(options: CreateNoteOptions): Promise<Note> {
    if (options.linkedEventId && options.linkedTaskId) {
      throw new InvalidInputError('Notes cannot be linked to both an event and a task');
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

    let insertedNote: Note;
    try {
      [insertedNote] = await this.db.insert(notes).values(newNote).returning();
    } catch (err) {
      // undo the file write
      await deleteNoteFile(filePath);
      throw err;
    }
    // the file is written empty
    this.changes.emit({ type: 'created', note: insertedNote, content: '' });
    return insertedNote;
  }

  async listNotes(
    filter: NoteFilterOptions = {},
    sort: NoteSortOptions = { sortBy: 'updatedAt' },
    page: PageOptions = {},
  ): Promise<Page<Note>> {
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

    let sortColumn: SQLiteColumn;
    switch (sort.sortBy) {
      case 'title':
        sortColumn = notes.title;
        break;
      case 'createdAt':
        sortColumn = notes.createdAt;
        break;
      case 'updatedAt':
        sortColumn = notes.updatedAt;
        break;
    }

    const pager = keyset<Note>(
      {
        sortKey: sort.sortBy,
        sortColumn,
        idColumn: notes.id,
        direction: sort.direction === 'asc' ? 'asc' : 'desc',
        sortValue: (row) => row[sortColumn.name as keyof Note],
        id: (row) => row.id,
      },
      page,
    );

    const rows = await this.db
      .select()
      .from(notes)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);

    return pager.toPage(rows);
  }

  async updateNote(id: NoteId, options: UpdateNoteOptions): Promise<Note> {
    if (options.linkedEventId && options.linkedTaskId) {
      throw new InvalidInputError('Notes cannot be linked to both an event and a task');
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
    if (!updatedNote) throw new NotFoundError(id);
    this.changes.emit({ type: 'updated', note: updatedNote });
    return updatedNote;
  }

  // Saves to one note run one at a time, in the order they were called, so the last call wins: its
  // content is what ends up in the file, the preview and the search index. Each save's file write,
  // preview and change come from its own content, and every call resolves with the row it wrote
  // (or rejects with its own error, which does not stop the saves queued after it).
  // Throws NotFoundError for an unknown or archived note, or one deleted while saving.
  async updateNoteContent(id: NoteId, content: string): Promise<Note> {
    const previous = this.contentSaves.get(id);
    const save = previous
      ? previous.catch(() => undefined).then(() => this.saveNoteContent(id, content))
      : this.saveNoteContent(id, content);
    this.contentSaves.set(id, save);
    try {
      return await save;
    } finally {
      if (this.contentSaves.get(id) === save) this.contentSaves.delete(id);
    }
  }

  private async saveNoteContent(id: NoteId, content: string): Promise<Note> {
    // think about this, could just pass in the title or the note object itself
    const existing = await this.getById(id);

    const preview = stripMarkdown(content.trim()).slice(0, 200);

    await updateNoteFile(this.noteFilePath(id), { id, title: existing.title }, content);

    const [updatedNote] = await this.db
      .update(notes)
      .set({
        preview: preview || null,
      })
      .where(eq(notes.id, id))
      .returning();
    if (!updatedNote) throw new NotFoundError(id);
    this.changes.emit({ type: 'updated', note: updatedNote, content });
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
