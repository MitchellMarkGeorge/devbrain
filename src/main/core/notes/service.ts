import { generateId, NoteId } from '@common/ids';
import { notes } from '@main/db/schema/notes';
import { tasks } from '@main/db/schema/tasks';
import { SQL, and, isNull, asc, desc, eq, inArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import path from 'node:path';
import { deleteNoteFile, readNoteFile, updateNoteFile, writeNoteFile } from '../local/notes';
import {
  CreateNoteOptions,
  Note,
  NoteDeleteResult,
  NoteFilterOptions,
  NoteListItem,
  NoteSortOptions,
  UpdateNoteOptions,
} from './types';
import { stripMarkdown } from '../shared/markdown';
import { InvalidInputError, NotArchivedError, NotFoundError } from '../shared/errors';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { withNoteListDetails } from './details';
import { consoleLogger, errorClass, type Logger } from '../shared/logger';

// what a note row shows of its markdown, or null for an empty note
function previewOf(content: string): string | null {
  return stripMarkdown(content.trim()).slice(0, 200) || null;
}

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after both the note's file and its row are written,
// with the row as written. `content` is the note's new markdown when the write changed it; a write
// that leaves the body alone (a rename, a new project or link) has none. `deleted` is sent as the
// delete's last step, inside its transaction, so search drops the note in the same commit; the
// file is removed after.
export type NoteChange =
  | { type: 'created'; note: Note; content: string }
  | { type: 'updated'; note: Note; content?: string }
  | ({ type: 'deleted' } & Omit<NoteDeleteResult, 'fileRemoved'>);

export class NoteService {
  private workspaceNotesPath: string;
  private readonly changes = new ChangeListeners<NoteChange>('Note');
  // the tail of each note's queue of content saves (and a delete), removed once the queue drains
  private readonly contentSaves = new Map<NoteId, Promise<unknown>>();

  constructor(
    private readonly db: BetterSQLite3Database,
    workspacePath: string,
    private readonly logger: Pick<Logger, 'warn'> = consoleLogger,
  ) {
    this.workspaceNotesPath = path.join(workspacePath, 'notes');
  }

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<NoteChange>): () => void {
    return this.changes.add(listener);
  }

  getById(id: NoteId): Note {
    const note = this.activeNotes(eq(notes.id, id)).get();
    if (!note) throw new NotFoundError(id);
    return note;
  }

  getByIds(ids: NoteId[]): Note[] {
    return this.activeNotes(inArray(notes.id, ids)).all();
  }

  async createNote(options: CreateNoteOptions): Promise<Note> {
    const [note] = await this.createNotes([options]);
    return note;
  }

  /**
   * Creates notes, all or none: every file is written first, then every row in one transaction, and
   * on any failure the files written are removed again. A `created` is sent for each note, with its
   * content, as the transaction's last step, so the search index commits with the rows. Returns the
   * notes in the order given. Throws InvalidInputError for a note linked to both an event and a task.
   */
  async createNotes(batch: CreateNoteOptions[]): Promise<Note[]> {
    for (const options of batch) {
      if (options.linkedEventId && options.linkedTaskId) {
        throw new InvalidInputError('Notes cannot be linked to both an event and a task');
      }
    }

    const prepared = batch.map((options) => {
      const id = generateId('note');
      const content = options.content ?? '';
      return {
        content,
        row: {
          id,
          title: options.title ?? '',
          filePath: this.noteFilePath(id),
          preview: previewOf(content),
          projectId: options.projectId ?? null,
          // either, not both
          linkedTaskId: options.linkedTaskId ?? null,
          linkedEventId: options.linkedEventId ?? null,
        },
      };
    });

    const written: string[] = [];
    try {
      // write the files first then update the DB
      for (const { row, content } of prepared) {
        await writeNoteFile(row.filePath, { id: row.id, title: row.title }, content);
        written.push(row.filePath);
      }
      return this.db.transaction((tx) => {
        const created = prepared.map(({ row, content }) => ({
          note: tx.insert(notes).values(row).returning().get(),
          content,
        }));
        for (const { note, content } of created) {
          this.changes.emit({ type: 'created', note, content });
        }
        return created.map(({ note }) => note);
      });
    } catch (err) {
      // undo the file writes
      await Promise.all(written.map((filePath) => deleteNoteFile(filePath)));
      throw err;
    }
  }

  // Every active (unarchived) note, oldest first: what an export writes. Not paged.
  listAll(): Note[] {
    return this.db
      .select()
      .from(notes)
      .where(isNull(notes.archivedAt))
      .orderBy(asc(notes.createdAt), asc(notes.id))
      .all();
  }

  // The markdown of an active note, read from its file, without the file's front matter. Throws
  // NotFoundError for an unknown or archived note, MalformedNoteFileError for a damaged file.
  async readContent(id: NoteId): Promise<string> {
    this.getById(id);
    const { content } = await readNoteFile(this.noteFilePath(id));
    return content;
  }

  listNotes(
    filter: NoteFilterOptions = {},
    sort: NoteSortOptions = { sortBy: 'updatedAt' },
    page: PageOptions = {},
  ): Page<NoteListItem> {
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

    const rows = this.db
      .select()
      .from(notes)
      .where(and(...clauses, pager.after))
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit)
      .all();

    // filled after the page is cut, so the lookups cover only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: withNoteListDetails(this.db, result.items) };
  }

  updateNote(id: NoteId, options: UpdateNoteOptions): Note {
    if (options.linkedEventId && options.linkedTaskId) {
      throw new InvalidInputError('Notes cannot be linked to both an event and a task');
    }

    const updates: UpdateNoteOptions = {};
    if (options.title !== undefined) updates.title = options.title;
    if (options.projectId !== undefined) updates.projectId = options.projectId;
    if (options.linkedEventId !== undefined) updates.linkedEventId = options.linkedEventId;
    if (options.linkedTaskId !== undefined) updates.linkedTaskId = options.linkedTaskId;

    const updatedNote = this.db
      .update(notes)
      .set(updates)
      .where(eq(notes.id, id))
      .returning()
      .get();
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

  /**
   * Deletes an archived note for good (the UI calls archived items "in the trash"; deleting is
   * only offered there): its row, then its markdown file. An active one throws NotArchivedError.
   * Tasks that link to it are kept and lose the link, by the foreign key's `set null`. Favorites
   * and recents are columns of the row and go with it.
   *
   * It waits behind the note's content saves already queued, so none writes the file again after
   * it is removed; a save called after it finds no note and throws NotFoundError.
   *
   * The file goes after the row's transaction commits, so a failed delete never leaves a row
   * without its file. If removing the file then fails, the delete has still happened and is not
   * undone or reported as an error: the note is gone from the app, the call resolves with
   * `fileRemoved: false`, and the failure is logged. The file stays in the notes folder, which
   * nothing reads without a row. A file already missing counts as removed.
   *
   * Throws NotFoundError for an unknown id, and NotArchivedError for one not in the trash.
   */
  async deleteNote(id: NoteId): Promise<NoteDeleteResult> {
    const previous = this.contentSaves.get(id);
    const deletion = previous
      ? previous.catch(() => undefined).then(() => this.removeNote(id))
      : this.removeNote(id);
    this.contentSaves.set(id, deletion);
    try {
      return await deletion;
    } finally {
      if (this.contentSaves.get(id) === deletion) this.contentSaves.delete(id);
    }
  }

  private async removeNote(id: NoteId): Promise<NoteDeleteResult> {
    const { linkedTaskId, unlinkedTaskIds } = this.db.transaction((tx) => {
      const existing = tx
        .select({ archivedAt: notes.archivedAt, linkedTaskId: notes.linkedTaskId })
        .from(notes)
        .where(eq(notes.id, id))
        .get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      // read before the delete clears their link: tasks made from the note, subtasks included
      const linked = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.linkedNoteId, id))
        .all()
        .map((row) => row.id);
      tx.delete(notes).where(eq(notes.id, id)).run();
      const change = { noteId: id, linkedTaskId: existing.linkedTaskId, unlinkedTaskIds: linked };
      this.changes.emit({ type: 'deleted', ...change });
      return change;
    });

    // the path the app reads and writes, not the stored filePath, which can predate a move of the
    // workspace folder
    let fileRemoved = true;
    try {
      await deleteNoteFile(this.noteFilePath(id));
    } catch (error) {
      fileRemoved = false;
      // the class only: the error quotes the note's file path
      this.logger.warn(`Removing deleted note ${id}'s file failed error=${errorClass(error)}`);
    }
    return { noteId: id, linkedTaskId, unlinkedTaskIds, fileRemoved };
  }

  private async saveNoteContent(id: NoteId, content: string): Promise<Note> {
    // think about this, could just pass in the title or the note object itself
    const existing = this.getById(id);

    await updateNoteFile(this.noteFilePath(id), { id, title: existing.title }, content);

    const updatedNote = this.db
      .update(notes)
      .set({
        preview: previewOf(content),
      })
      .where(eq(notes.id, id))
      .returning()
      .get();
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
