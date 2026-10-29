import { NoteId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { stripMarkdown } from '../shared/markdown';
import { errorClass } from '../shared/logger';
import { readNoteFile } from '../local/notes';
import type { Event } from '../events/types';
import type { Note } from '../notes/types';
import type { Project } from '../projects/types';
import type { Task } from '../tasks/types';
import type { IndexEntity, RebuildResult, SearchOptions, SearchResult } from './types';
import { HIGHLIGHT_END, HIGHLIGHT_START, highlightToHtml, toFtsQuery } from './utils';
import { and, inArray, isNull, not, sql, SQL } from 'drizzle-orm';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { events } from '@main/db/schema/events';
import { hasLinkInState } from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';

// rows per INSERT when writing many entries at once: four bound values each, well under SQLite's
// limit on variables in one statement
const INSERT_CHUNK = 1000;

// The note files read for one call, and the notes whose content a write indexed while they were
// being read: those writes are newer than the files read, so their entries are kept.
interface NoteFileRead {
  bodies: Map<NoteId, string>;
  unreadable: NoteId[];
  written: Set<NoteId>;
}

// What an index write that finished after its cause changed, for in-process subscribers such as the
// IPC layer, so open searches refetch. Only the writes that wait on note files send one: every
// other index write runs inside the change that caused it, which subscribers hear already.
// `notes_indexed` carries the notes whose entries were written; `rebuilt` replaced every entry.
export type SearchChange = { type: 'notes_indexed'; noteIds: NoteId[] } | { type: 'rebuilt' };

export class SearchService {
  private readonly changes = new ChangeListeners<SearchChange>('Search');
  private workspaceNotesPath: string;
  // one set per note file read in flight; indexNoteContent adds the note it indexes to each
  private readonly noteWrites = new Set<Set<NoteId>>();
  // index writes waiting on note files, until they settle; see whenIdle
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly db: BetterSQLite3Database,
    workspacePath: string,
  ) {
    this.workspaceNotesPath = path.join(workspacePath, 'notes');
  }

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<SearchChange>): () => void {
    return this.changes.add(listener);
  }

  /**
   * The entries matching `query`, best first. `title` and `body` are HTML: the indexed text
   * escaped, with each match in <b>…</b> and nothing else (see highlightToHtml). Titles and bodies
   * hold user and provider text, so they are never handed out with unescaped markup.
   */
  search({ query, entityType, limit }: SearchOptions): SearchResult[] {
    const ftsQuery = toFtsQuery(query);

    if (!ftsQuery) return [];

    const searchQuery = sql`
      SELECT
        highlight(search_index, 0, ${HIGHLIGHT_START}, ${HIGHLIGHT_END}) AS title,
        snippet(search_index, 1, ${HIGHLIGHT_START}, ${HIGHLIGHT_END}, '…', 15) as body,
        entity_id as entityId,
        entity_type as entityType,
        bm25(search_index, 10.0, 1.0) AS rank
      FROM search_index
      WHERE search_index MATCH ${ftsQuery}
    `;

    if (entityType !== undefined && entityType.length) {
      const entityTypeChunks = entityType.map((type) => sql`${type}`);
      const entityTypeArray = sql.join(entityTypeChunks, sql.raw(', '));
      searchQuery.append(sql`AND entity_type IN (${entityTypeArray})`);
    }

    searchQuery.append(sql`ORDER BY rank`);

    if (limit) {
      searchQuery.append(sql` LIMIT ${sql.raw(limit.toString())}`);
    }

    const rows: SearchResult[] = this.db.all(searchQuery);

    return rows.map((row) => ({
      ...row,
      title: highlightToHtml(row.title),
      body: highlightToHtml(row.body),
    }));
  }

  indexTask(task: Task) {
    this.indexTasks([task]);
  }

  async indexNote(note: Note) {
    await this.indexNotes([note]);
  }

  // indexes a note from its markdown, for a write that has it in hand; indexNotes reads the files
  indexNoteContent(note: Note, content: string): void {
    this.upsertIndexBatch([
      {
        title: note.title,
        body: stripMarkdown(content.trim()),
        entityId: note.id,
        entityType: 'note',
      },
    ]);
    for (const written of this.noteWrites) written.add(note.id);
  }

  /**
   * Indexes these notes from their files, for notes coming back into search with no content in
   * hand, such as restored ones. Only notes still active once their files are read are indexed,
   * and a note whose content a write indexed meanwhile keeps that write's entry. A file that can't
   * be read keeps only its own note out. Returns the ids of the notes whose files couldn't be read.
   */
  async indexNoteFiles(ids: NoteId[]): Promise<NoteId[]> {
    if (ids.length === 0) return [];
    const { unreadable, noteIds } = await this.withNoteFiles(
      inArray(notes.id, ids),
      ({ bodies, unreadable, written }) => {
        const current = this.activeNotes(inArray(notes.id, [...bodies.keys()]));
        const entities = current
          .filter(({ id }) => !written.has(id))
          .map((note) => noteEntity(note, bodies));
        this.upsertIndexBatch(entities);
        return { unreadable, noteIds: entities.map(({ entityId }) => entityId as NoteId) };
      },
    );
    // once the transaction has committed
    this.emitNotesIndexed(noteIds);
    return unreadable;
  }

  /**
   * Rebuilds the whole index from the current rows and note files, to repair one that drifted.
   * Indexes what the services keep searchable: active tasks, projects and notes, and every event
   * except those whose provider item was removed. The old entries are replaced in one transaction,
   * once the note files are read, so searches see the old index until then. A note whose content a
   * write indexed meanwhile keeps that entry; one whose file can't be read is left out and
   * reported.
   */
  async rebuild(): Promise<RebuildResult> {
    const result = await this.withNoteFiles(undefined, ({ bodies, unreadable, written }) => {
      const entities: IndexEntity[] = [
        ...this.db
          .select()
          .from(tasks)
          .where(isNull(tasks.archivedAt))
          .all()
          .map((task) => taskEntity(task)),
        ...this.db
          .select()
          .from(projects)
          .where(isNull(projects.archivedAt))
          .all()
          .map((project) => projectEntity(project)),
        ...this.db
          .select()
          .from(events)
          .where(not(hasLinkInState('event', events.id, LinkState.REMOVED)))
          .all()
          .map((event) => eventEntity(event)),
        ...this.activeNotes(inArray(notes.id, [...bodies.keys()]))
          .filter(({ id }) => !written.has(id))
          .map((note) => noteEntity(note, bodies)),
      ];

      const kept = [...written].map((id) => sql`${id}`);
      this.db.run(
        kept.length === 0
          ? sql`DELETE FROM search_index`
          : sql`DELETE FROM search_index WHERE entity_id NOT IN (${sql.join(kept, sql.raw(', '))})`,
      );
      for (let i = 0; i < entities.length; i += INSERT_CHUNK) {
        this.db.run(insertQuery(entities.slice(i, i + INSERT_CHUNK)));
      }
      const [[indexed]] = this.db.values<[number]>(sql`SELECT count(*) FROM search_index`);
      return { indexed, unreadableNoteIds: unreadable };
    });
    this.changes.emit({ type: 'rebuilt' });
    return result;
  }

  indexProject(project: Project) {
    this.indexProjects([project]);
  }

  indexEvent(event: Event) {
    this.indexEvents([event]);
  }

  // plural counterparts to the single-entity methods above — the whole batch
  // is deleted+inserted as one DELETE and one multi-row INSERT inside one
  // transaction, instead of a DELETE+INSERT pair per entity. Matters once
  // you're indexing more than a handful of rows at a time (e.g. a bulk
  // (re)index or a seed script).
  indexTasks(tasks: Task[]): void {
    this.upsertIndexBatch(tasks.map((task) => taskEntity(task)));
  }

  indexNotes(notes: Note[]): Promise<void> {
    return this.track(async () => {
      // the DB only keeps a truncated plaintext preview — read each note's
      // backing markdown file for the full body and strip its formatting so
      // the index holds plain, searchable text. The file reads are resolved
      // up front so the transaction below only ever does synchronous work.
      const entities = await Promise.all(
        notes.map(async (note) => {
          const { content } = await readNoteFile(this.noteFilePath(note.id));
          return {
            title: note.title,
            body: stripMarkdown(content.trim()),
            entityId: note.id,
            entityType: 'note' as const,
          };
        }),
      );
      this.upsertIndexBatch(entities);
      this.emitNotesIndexed(notes.map(({ id }) => id));
    });
  }

  indexProjects(projects: Project[]): void {
    this.upsertIndexBatch(projects.map((project) => projectEntity(project)));
  }

  indexEvents(events: Event[]): void {
    this.upsertIndexBatch(events.map((event) => eventEntity(event)));
  }

  /**
   * Resolves once every index write waiting on note files has settled: those of indexNotes,
   * indexNoteFiles and rebuild, including ones started while waiting. Every other write is
   * synchronous. Never rejects; each caller still gets its own call's error. The workspace waits
   * on this before closing the database.
   */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  // drops the entries for these entities, e.g. synced rows that left scope; ids with no entry
  // are ignored. One DELETE for the whole batch, like upsertIndexBatch.
  removeFromIndex(entityIds: IndexEntity['entityId'][]): void {
    if (entityIds.length === 0) return;

    const ids = sql.join(
      entityIds.map((entityId) => sql`${entityId}`),
      sql.raw(', '),
    );
    this.db.run(sql`DELETE FROM search_index WHERE entity_id IN (${ids})`);
  }

  // changes an entry's title and keeps its body; an entity with no entry is ignored
  updateIndexedTitle(entityId: IndexEntity['entityId'], title: string): void {
    this.db.run(sql`UPDATE search_index SET title = ${title} WHERE entity_id = ${entityId}`);
  }

  private noteFilePath(id: NoteId): string {
    return path.join(this.workspaceNotesPath, `${id}.md`);
  }

  // the active notes matching `condition`, as they are now
  private activeNotes(condition: SQL) {
    return this.db
      .select()
      .from(notes)
      .where(and(condition, isNull(notes.archivedAt)))
      .all();
  }

  /**
   * Reads the files of the active notes matching `condition` (every active note when left out),
   * then runs `write` in one transaction. Nothing else runs between `write` reading the rows and
   * writing the index, so it sees the notes as they are then, and which of them a write indexed
   * while the files were read.
   */
  private withNoteFiles<T>(
    condition: SQL | undefined,
    write: (read: NoteFileRead) => T,
  ): Promise<T> {
    return this.track(async () => {
      const written = new Set<NoteId>();
      this.noteWrites.add(written);
      try {
        const ids = this.db
          .select({ id: notes.id })
          .from(notes)
          .where(and(condition, isNull(notes.archivedAt)))
          .all()
          .map(({ id }) => id);
        const files = await Promise.allSettled(
          ids.map((id) => readNoteFile(this.noteFilePath(id))),
        );

        const bodies = new Map<NoteId, string>();
        const unreadable: NoteId[] = [];
        files.forEach((file, i) => {
          if (file.status === 'fulfilled') {
            bodies.set(ids[i], stripMarkdown(file.value.content.trim()));
          } else {
            unreadable.push(ids[i]);
            // the class only: the error quotes the note's file path
            console.error(
              `Reading note ${ids[i]} for search failed error=${errorClass(file.reason)}`,
            );
          }
        });
        return this.db.transaction(() => write({ bodies, unreadable, written }));
      } finally {
        this.noteWrites.delete(written);
      }
    });
  }

  private emitNotesIndexed(noteIds: NoteId[]): void {
    if (noteIds.length > 0) this.changes.emit({ type: 'notes_indexed', noteIds });
  }

  // runs `work` and keeps it in `pending` until it settles. Its synchronous start runs now, in the
  // caller's turn, so one started inside a transaction reads the rows that transaction sees.
  private track<T>(work: () => Promise<T>): Promise<T> {
    const running = work();
    const settled: Promise<void> = running.then(
      () => undefined,
      () => undefined,
    );
    this.pending.add(settled);
    void settled.then(() => this.pending.delete(settled));
    return running;
  }

  private upsertIndexBatch(entities: IndexEntity[]): void {
    if (entities.length === 0) return;

    // search_index is a plain (non-content-linked) fts5 table, so there's no
    // rowid tied to entityId to UPSERT against — clear out any existing rows
    // for these entities first, then insert the current versions. entity_id
    // alone is enough to match on: ids are generated per-entity-type-prefixed
    // uuidv7s (see @common/ids), so they're globally unique across every
    // entity type already, the same guarantee the rest of the schema relies
    // on — no need to also filter on entity_type here.
    const entityIds = sql.join(
      entities.map(({ entityId }) => sql`${entityId}`),
      sql.raw(', '),
    );
    const deleteQuery = sql`DELETE FROM search_index WHERE entity_id IN (${entityIds})`;

    this.db.transaction((tx) => {
      tx.run(deleteQuery);
      tx.run(insertQuery(entities));
    });
  }
}

function insertQuery(entities: IndexEntity[]): SQL {
  const valueRows = sql.join(
    entities.map(
      ({ title, body, entityId, entityType }) =>
        sql`(${title}, ${body}, ${entityId}, ${entityType})`,
    ),
    sql.raw(', '),
  );
  return sql`INSERT INTO search_index (title, body, entity_id, entity_type) VALUES ${valueRows}`;
}

// what each entity type puts in the index; tables' rows and the services' types both fit
function taskEntity(task: Pick<Task, 'id' | 'title' | 'description'>): IndexEntity {
  return { title: task.title, body: task.description ?? '', entityId: task.id, entityType: 'task' };
}

function projectEntity(project: Pick<Project, 'id' | 'title' | 'description'>): IndexEntity {
  return {
    title: project.title,
    body: project.description ?? '',
    entityId: project.id,
    entityType: 'project',
  };
}

function eventEntity(event: Pick<Event, 'id' | 'title' | 'description'>): IndexEntity {
  return {
    title: event.title,
    body: event.description ?? '',
    entityId: event.id,
    entityType: 'event',
  };
}

// a note read by withNoteFiles: its title as it is now, its body from its file
function noteEntity(note: Pick<Note, 'id' | 'title'>, bodies: Map<NoteId, string>): IndexEntity {
  return { title: note.title, body: bodies.get(note.id)!, entityId: note.id, entityType: 'note' };
}
