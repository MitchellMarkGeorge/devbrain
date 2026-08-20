import { NoteId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { stripMarkdown } from '../shared/markdown';
import { readNoteFile } from '../local/notes';
import type { Event } from '../events/types';
import type { Note } from '../notes/types';
import type { Project } from '../projects/types';
import type { Task } from '../tasks/types';
import type { IndexEntity, SearchOptions, SearchResult } from './types';
import { toFtsQuery } from './utils';
import { sql } from 'drizzle-orm';

export class SearchService {
  private workspaceNotesPath: string;

  constructor(
    private readonly db: BetterSQLite3Database,
    workspacePath: string,
  ) {
    this.workspaceNotesPath = path.join(workspacePath, 'notes');
  }

  search({ query, entityType, limit }: SearchOptions): SearchResult[] {
    const ftsQuery = toFtsQuery(query);

    if (!ftsQuery) return [];

    const searchQuery = sql`
      SELECT
        highlight(search_index, 0, '<b>', '</b>') AS title,
        snippet(search_index, 1, '<b>', '</b>', '…', 15) as body,
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

    const result: SearchResult[] = this.db.all(searchQuery);

    return result;
  }

  indexTask(task: Task) {
    this.indexTasks([task]);
  }

  async indexNote(note: Note) {
    await this.indexNotes([note]);
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
    this.upsertIndexBatch(
      tasks.map((task) => ({
        title: task.title,
        body: task.description ?? '',
        entityId: task.id,
        entityType: 'task' as const,
      })),
    );
  }

  async indexNotes(notes: Note[]): Promise<void> {
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
  }

  indexProjects(projects: Project[]): void {
    this.upsertIndexBatch(
      projects.map((project) => ({
        title: project.title,
        body: project.description ?? '',
        entityId: project.id,
        entityType: 'project' as const,
      })),
    );
  }

  indexEvents(events: Event[]): void {
    this.upsertIndexBatch(
      events.map((event) => ({
        title: event.title,
        body: event.description ?? '',
        entityId: event.id,
        entityType: 'event' as const,
      })),
    );
  }

  private noteFilePath(id: NoteId): string {
    return path.join(this.workspaceNotesPath, `${id}.md`);
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

    const valueRows = sql.join(
      entities.map(
        ({ title, body, entityId, entityType }) =>
          sql`(${title}, ${body}, ${entityId}, ${entityType})`,
      ),
      sql.raw(', '),
    );
    const insertQuery = sql`INSERT INTO search_index (title, body, entity_id, entity_type) VALUES ${valueRows}`;

    this.db.transaction((tx) => {
      tx.run(deleteQuery);
      tx.run(insertQuery);
    });
  }
}
