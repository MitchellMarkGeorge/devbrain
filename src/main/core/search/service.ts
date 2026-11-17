import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { stripMarkdown } from '../shared/markdown';
import { errorClass } from '../shared/logger';
import { readNoteFile } from '../local/notes';
import {
  type Event,
  LinkState,
  type Note,
  type Project,
  type SearchCounts,
  type SearchEntityType,
  type SearchResult,
  type Task,
} from '@common/types';
import type { IndexEntity, RebuildResult, SearchOptions } from './types';
import { HIGHLIGHT_END, HIGHLIGHT_START, highlightToHtml, toFtsQuery } from './utils';
import { and, count, inArray, isNull, not, sql, SQL } from 'drizzle-orm';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { events } from '@main/db/schema/events';
import { hasLinkInState } from '../integrations/refs';
import { searchIndex } from './search-index';
import { searchIndexEntries } from '@main/db/schema/search';
import { withListDetails } from '../tasks/details';
import { withNoteListDetails } from '../notes/details';
import { withProjectListDetails } from '../projects/details';
import { withEventDetails } from '../events/service';

// entries per statement when writing many at once: an INSERT binds five values per entry, a DELETE
// one, both well under SQLite's limit of 32,766 variables in one statement
const INSERT_CHUNK = 1000;
const DELETE_CHUNK = 10_000;

// The note files read for one call, and the notes whose content a write indexed while they were
// being read: those writes are newer than the files read, so their entries are kept.
interface NoteFileRead {
  bodies: Map<NoteId, string>;
  unreadable: NoteId[];
  written: Set<NoteId>;
}

export class SearchService {
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

  /**
   * The entries matching `query`, best first, each with the entity it found as that entity's list
   * returns it (a `TaskListItem`, `NoteListItem`, `ProjectListItem` or `Event`). `title` and `body`
   * are HTML: the indexed text escaped, with each match in <b>…</b> and nothing else (see
   * highlightToHtml). Titles and bodies hold user and provider text, so they are never handed out
   * with unescaped markup.
   *
   * The matches are ranked and cut to `limit` first, then the entities are read: one query per
   * type for the matches of that type, with the same details the type's list adds. An entry whose
   * row is gone or archived is left out.
   */
  search({ query, entityType, limit }: SearchOptions): SearchResult[] {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];

    // 1. The best matches, highlighted: ranked and cut to `limit`, so FTS5 builds titles and
    //    snippets only for the matches returned.
    const ranked = this.db
      .select({
        title: sql<string>`highlight(${searchIndex}, 0, ${HIGHLIGHT_START}, ${HIGHLIGHT_END})`,
        body: sql<string>`snippet(${searchIndex}, 1, ${HIGHLIGHT_START}, ${HIGHLIGHT_END}, '…', 15)`,
        entityId: searchIndex.entityId,
        entityType: searchIndex.entityType,
        rank: sql<number>`bm25(${searchIndex}, 10.0, 1.0)`.as('match_rank'),
      })
      .from(searchIndex)
      .where(
        and(
          sql`${searchIndex} MATCH ${ftsQuery}`,
          entityType.length ? inArray(searchIndex.entityType, entityType) : undefined,
        ),
      )
      .orderBy(sql`match_rank`)
      .$dynamic();
    if (limit) ranked.limit(limit);
    const matches = ranked.all();

    // 2. The entities, a query per type, kept in the matches' order
    const entities = this.entitiesOf(matches);
    return matches.flatMap(({ entityType: type, entityId, ...match }) => {
      const entity = entities[type].get(entityId);
      if (!entity) return [];
      return [
        {
          entityType: type,
          entity,
          title: highlightToHtml(match.title),
          body: highlightToHtml(match.body),
          rank: match.rank,
        } as SearchResult,
      ];
    });
  }

  // Each matched entity by id, per type: its unarchived row with the details its list adds.
  private entitiesOf(matches: { entityType: SearchEntityType; entityId: string }[]) {
    const idsOf = (type: SearchEntityType) =>
      matches.filter((match) => match.entityType === type).map((match) => match.entityId);
    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
    const read = <T>(ids: string[], load: () => T[]) => (ids.length ? load() : []);

    const taskIds = idsOf('task') as TaskId[];
    const noteIds = idsOf('note') as NoteId[];
    const projectIds = idsOf('project') as ProjectId[];
    const eventIds = idsOf('event') as EventId[];
    return {
      task: byId(
        read(taskIds, () =>
          withListDetails(
            this.db,
            this.db
              .select()
              .from(tasks)
              .where(and(inArray(tasks.id, taskIds), isNull(tasks.archivedAt)))
              .all(),
          ),
        ),
      ),
      note: byId(
        read(noteIds, () =>
          withNoteListDetails(
            this.db,
            this.db
              .select()
              .from(notes)
              .where(and(inArray(notes.id, noteIds), isNull(notes.archivedAt)))
              .all(),
          ),
        ),
      ),
      project: byId(
        read(projectIds, () =>
          withProjectListDetails(
            this.db,
            this.db
              .select()
              .from(projects)
              .where(and(inArray(projects.id, projectIds), isNull(projects.archivedAt)))
              .all(),
          ),
        ),
      ),
      event: byId(
        read(eventIds, () =>
          withEventDetails(
            this.db,
            this.db.select().from(events).where(inArray(events.id, eventIds)).all(),
          ),
        ),
      ),
    } satisfies { [K in SearchEntityType]: Map<string, SearchResult<K>['entity']> };
  }

  /**
   * How many entries match `query`, of each type: all of them, with no limit, so a type filter
   * can say how many it has before they are listed. Counts the index's entries, so an entry whose
   * row is gone is counted though `search` leaves it out (the index follows every write, so that is
   * a moment at most). One FTS query, grouped by type, with no highlighting.
   */
  counts(query: string): SearchCounts {
    const counts: SearchCounts = { task: 0, note: 0, project: 0, event: 0 };
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return counts;

    const rows = this.db
      .select({ entityType: searchIndex.entityType, count: count() })
      .from(searchIndex)
      .where(sql`${searchIndex} MATCH ${ftsQuery}`)
      .groupBy(searchIndex.entityType)
      .all();
    for (const row of rows) counts[row.entityType] = row.count;
    return counts;
  }

  indexTask(task: Task) {
    this.indexTasks([task]);
  }

  /**
   * Indexes a task just created, which has no entry yet: it only inserts, skipping the lookup a
   * replace makes, which keeps an import of thousands of rows cheap.
   */
  indexCreatedTask(task: Task): void {
    this.insertEntries([taskEntity(task)]);
  }

  async indexNote(note: Note) {
    await this.indexNotes([note]);
  }

  // a note just created, from its markdown; only inserts, as indexCreatedTask does
  indexCreatedNote(note: Note, content: string): void {
    this.insertEntries([
      {
        title: note.title,
        body: stripMarkdown(content.trim()),
        entityId: note.id,
        entityType: 'note',
      },
    ]);
    for (const written of this.noteWrites) written.add(note.id);
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
    return this.withNoteFiles(inArray(notes.id, ids), ({ bodies, unreadable, written }) => {
      const current = this.activeNotes(inArray(notes.id, [...bodies.keys()]));
      this.upsertIndexBatch(
        current.filter(({ id }) => !written.has(id)).map((note) => noteEntity(note, bodies)),
      );
      return unreadable;
    });
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
    return this.withNoteFiles(undefined, ({ bodies, unreadable, written }) => {
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

      // every entry but those of the notes written meanwhile, including rows the map lost track of
      // (the drift a rebuild repairs): one pass over the index
      const kept = sql.join(
        [...written].map((id) => sql`${id}`),
        sql.raw(', '),
      );
      if (written.size === 0) {
        this.db.run(sql`DELETE FROM search_index`);
        this.db.run(sql`DELETE FROM search_index_entries`);
      } else {
        this.db.run(
          sql`DELETE FROM search_index WHERE rowid NOT IN
              (SELECT row_id FROM search_index_entries WHERE entity_id IN (${kept}))`,
        );
        this.db.run(sql`DELETE FROM search_index_entries WHERE entity_id NOT IN (${kept})`);
      }
      this.insertEntries(entities);
      const [[indexed]] = this.db.values<[number]>(sql`SELECT count(*) FROM search_index`);
      return { indexed, unreadableNoteIds: unreadable };
    });
  }

  indexProject(project: Project) {
    this.indexProjects([project]);
  }

  indexEvent(event: Event) {
    this.indexEvents([event]);
  }

  // plural counterparts to the single-entity methods above — the whole batch
  // is deleted+inserted in one transaction, a few thousand entries per
  // statement, instead of a DELETE+INSERT pair per entity. Matters once
  // you're indexing more than a handful of rows at a time (e.g. a sync page
  // or a restore from the trash).
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
  // are ignored
  removeFromIndex(entityIds: IndexEntity['entityId'][]): void {
    if (entityIds.length === 0) return;
    this.db.transaction(() => this.deleteEntries(entityIds));
  }

  // changes an entry's title and keeps its body; an entity with no entry is ignored
  updateIndexedTitle(entityId: IndexEntity['entityId'], title: string): void {
    this.db.run(
      sql`UPDATE search_index SET title = ${title}
          WHERE rowid = (SELECT row_id FROM search_index_entries WHERE entity_id = ${entityId})`,
    );
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

  // replaces these entities' entries, or adds them, in one transaction
  private upsertIndexBatch(entities: IndexEntity[]): void {
    if (entities.length === 0) return;
    this.db.transaction(() => {
      this.deleteEntries(entities.map(({ entityId }) => entityId));
      this.insertEntries(entities);
    });
  }

  /**
   * Drops these entities' entries. search_index can't index entity_id, so finding an entry by it
   * reads the whole index; search_index_entries gives each one's rowid, which FTS5 looks up. Runs
   * inside the caller's transaction, so the two tables change together.
   */
  private deleteEntries(entityIds: readonly string[]): void {
    for (let i = 0; i < entityIds.length; i += DELETE_CHUNK) {
      const chunk = entityIds.slice(i, i + DELETE_CHUNK);
      const ids = sql.join(
        chunk.map((id) => sql`${id}`),
        sql.raw(', '),
      );
      this.db.run(
        sql`DELETE FROM search_index WHERE rowid IN
            (SELECT row_id FROM search_index_entries WHERE entity_id IN (${ids}))`,
      );
      this.db.run(sql`DELETE FROM search_index_entries WHERE entity_id IN (${ids})`);
    }
  }

  /**
   * Adds entries for entities that have none: a row in search_index_entries for each, whose rowid
   * the FTS row then takes. An entity listed twice gets its last entry. Runs inside the caller's
   * transaction.
   */
  private insertEntries(entities: readonly IndexEntity[]): void {
    if (entities.length === 1) {
      // one row, as each created task or note is: the FTS row takes the rowid just added
      const [{ title, body, entityId, entityType }] = entities;
      this.db.run(sql`INSERT INTO search_index_entries (entity_id) VALUES (${entityId})`);
      this.db.run(
        sql`INSERT INTO search_index (rowid, title, body, entity_id, entity_type)
            VALUES (last_insert_rowid(), ${title}, ${body}, ${entityId}, ${entityType})`,
      );
      return;
    }
    const unique = [...new Map(entities.map((entity) => [entity.entityId, entity])).values()];
    for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
      const chunk = unique.slice(i, i + INSERT_CHUNK);
      const rows = this.db
        .insert(searchIndexEntries)
        .values(chunk.map(({ entityId }) => ({ entityId })))
        .returning()
        .all();
      const rowIds = new Map(rows.map(({ entityId, rowId }) => [entityId, rowId]));
      this.db.run(insertQuery(chunk, rowIds));
    }
  }
}

function insertQuery(entities: readonly IndexEntity[], rowIds: Map<string, number>): SQL {
  const valueRows = sql.join(
    entities.map(
      ({ title, body, entityId, entityType }) =>
        sql`(${rowIds.get(entityId)}, ${title}, ${body}, ${entityId}, ${entityType})`,
    ),
    sql.raw(', '),
  );
  return sql`INSERT INTO search_index (rowid, title, body, entity_id, entity_type) VALUES ${valueRows}`;
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
