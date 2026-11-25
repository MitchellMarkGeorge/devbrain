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
import { and, count, inArray, isNotNull, isNull, not, sql, SQL } from 'drizzle-orm';
import { tasks } from '@main/db/schema/tasks';
import { externalLinks } from '@main/db/schema/integrations';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { events } from '@main/db/schema/events';
import { hasLinkInState } from '../integrations/refs';
import { searchIndex } from './search-index';
import { withListDetails } from '../tasks/details';
import { withNoteListDetails } from '../notes/details';
import { withProjectListDetails } from '../projects/details';
import { withEventDetails } from '../events/service';

// rows per INSERT when writing many entries at once: five bound values each, well under SQLite's
// limit on variables in one statement
const INSERT_CHUNK = 1000;
// task ids per lookup of their keys, under the same limit
const KEY_LOOKUP_CHUNK = 5000;

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
        // a key match ranks with a title match: a key is how its task is named elsewhere
        rank: sql<number>`bm25(${searchIndex}, 10.0, 1.0, 10.0)`.as('match_rank'),
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
   * Indexes a task just created, which has no entry yet. Only inserts: replacing an entry first
   * deletes by entity_id, which FTS5 can't index, so that delete reads the whole index, and doing
   * it for every row of an import made the import quadratic.
   */
  indexCreatedTask(task: Task): void {
    this.db.run(insertQuery(this.taskEntities([task])));
  }

  async indexNote(note: Note) {
    await this.indexNotes([note]);
  }

  // a note just created, from its markdown; only inserts, as indexCreatedTask does
  indexCreatedNote(note: Note, content: string): void {
    this.db.run(
      insertQuery([
        {
          title: note.title,
          body: stripMarkdown(content.trim()),
          key: '',
          entityId: note.id,
          entityType: 'note',
        },
      ]),
    );
    for (const written of this.noteWrites) written.add(note.id);
  }

  // indexes a note from its markdown, for a write that has it in hand; indexNotes reads the files
  indexNoteContent(note: Note, content: string): void {
    this.upsertIndexBatch([
      {
        title: note.title,
        body: stripMarkdown(content.trim()),
        key: '',
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
        ...this.allTaskEntities(),
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
    this.upsertIndexBatch(this.taskEntities(tasks));
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
            key: '',
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

  /**
   * The entries of these tasks, each with its provider key (ENG-123) when it has a link with one, in
   * any state: a detached task still shows its key, so it is still found by it. The key lives on
   * the link, so one query reads the keys of the whole batch.
   */
  private taskEntities(rows: Pick<Task, 'id' | 'title' | 'description'>[]): IndexEntity[] {
    if (rows.length === 0) return [];
    const keys = new Map<string, string>();
    const ids = rows.map(({ id }) => id);
    for (let i = 0; i < ids.length; i += KEY_LOOKUP_CHUNK) {
      for (const { taskId, key } of this.db
        .select({ taskId: externalLinks.taskId, key: externalLinks.externalKey })
        .from(externalLinks)
        .where(
          and(
            inArray(externalLinks.taskId, ids.slice(i, i + KEY_LOOKUP_CHUNK)),
            isNotNull(externalLinks.externalKey),
          ),
        )
        .all()) {
        keys.set(taskId!, key!);
      }
    }
    return rows.map((task) => taskEntity(task, keys.get(task.id) ?? ''));
  }

  // every active task's entry, for a rebuild: the keys of every task link read at once
  private allTaskEntities(): IndexEntity[] {
    const keys = new Map(
      this.db
        .select({ taskId: externalLinks.taskId, key: externalLinks.externalKey })
        .from(externalLinks)
        .where(and(isNotNull(externalLinks.taskId), isNotNull(externalLinks.externalKey)))
        .all()
        .map(({ taskId, key }) => [taskId!, key!]),
    );
    return this.db
      .select()
      .from(tasks)
      .where(isNull(tasks.archivedAt))
      .all()
      .map((task) => taskEntity(task, keys.get(task.id) ?? ''));
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
    settled.then(() => this.pending.delete(settled));
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
      ({ title, body, key, entityId, entityType }) =>
        sql`(${title}, ${body}, ${key}, ${entityId}, ${entityType})`,
    ),
    sql.raw(', '),
  );
  return sql`INSERT INTO search_index (title, body, key, entity_id, entity_type) VALUES ${valueRows}`;
}

// what each entity type puts in the index; tables' rows and the services' types both fit
function taskEntity(task: Pick<Task, 'id' | 'title' | 'description'>, key: string): IndexEntity {
  return {
    title: task.title,
    body: task.description ?? '',
    key,
    entityId: task.id,
    entityType: 'task',
  };
}

function projectEntity(project: Pick<Project, 'id' | 'title' | 'description'>): IndexEntity {
  return {
    title: project.title,
    body: project.description ?? '',
    key: '',
    entityId: project.id,
    entityType: 'project',
  };
}

function eventEntity(event: Pick<Event, 'id' | 'title' | 'description'>): IndexEntity {
  return {
    title: event.title,
    body: event.description ?? '',
    key: '',
    entityId: event.id,
    entityType: 'event',
  };
}

// a note read by withNoteFiles: its title as it is now, its body from its file
function noteEntity(note: Pick<Note, 'id' | 'title'>, bodies: Map<NoteId, string>): IndexEntity {
  return {
    title: note.title,
    body: bodies.get(note.id)!,
    key: '',
    entityId: note.id,
    entityType: 'note',
  };
}
