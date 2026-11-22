import { isId, type NoteId, type ProjectId, type TaskId } from '@common/ids';
import type { Mention, MentionSource, MentionSourceId, MentionTargetId } from '@common/types';
import { mentions } from '@main/db/schema/mentions';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { NoteService } from '../notes/service';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { isIndexBuilt, markIndexBuilt } from '../shared/index-builds';
import { errorClass, type Logger } from '../shared/logger';
import { extractMentions, type ExtractedMention } from './extract';

// What indexing changed, for in-process subscribers such as the IPC layer forwarding it to the
// renderer: the items whose Mentioned in now reads differently. Sent after the write commits.
export type MentionChange = { type: 'changed'; targetIds: MentionTargetId[] };

// rows per INSERT in a rebuild, well under SQLite's limit on bound parameters
const INSERT_CHUNK = 500;

type MentionRow = typeof mentions.$inferSelect;

/**
 * Which items mention which, from the `devbrain://` links in notes and in task and project
 * descriptions (docs: src/common/entity-links.ts). The workspace keeps it in step: it indexes a
 * source whenever its text is saved, and removes deleted items, as it does for search.
 *
 * Indexing is synchronous: the caller already has the text. Only `rebuild` reads note files.
 * A trashed source keeps its rows but is left out of `list` until it is restored.
 */
export class MentionService {
  private readonly changes: ChangeListeners<MentionChange>;
  // sources indexed while a rebuild reads the note files: newer than what it read, so it keeps them
  private rebuildWrites: Set<MentionSourceId> | null = null;
  private rebuilding: Promise<number> | null = null;

  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly notesService: Pick<NoteService, 'readContent'>,
    private readonly logger?: Pick<Logger, 'error'>,
  ) {
    this.changes = new ChangeListeners<MentionChange>('Mention', { logger });
  }

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<MentionChange>): () => void {
    return this.changes.add(listener);
  }

  /**
   * Replaces what `sourceId` mentions with the links in `markdown` (a note's content, a task's or
   * project's description; null when it has none). A source's links to itself are left out.
   * Announces the targets whose mention changed, if any.
   */
  indexSource(sourceId: MentionSourceId, markdown: string | null): void {
    this.rebuildWrites?.add(sourceId);
    const extracted = markdown ? extractMentions(markdown) : [];
    const rows = extracted
      .filter((mention) => mention.targetId !== sourceId)
      .map((mention) => toRow(sourceId, mention));

    const changed = this.db.transaction((tx) => {
      const before = tx.select().from(mentions).where(eq(mentions.sourceId, sourceId)).all();
      tx.delete(mentions).where(eq(mentions.sourceId, sourceId)).run();
      if (rows.length > 0) tx.insert(mentions).values(rows).run();
      return changedTargets(before, rows);
    });
    if (changed.length > 0) this.changes.emit({ type: 'changed', targetIds: changed });
  }

  /**
   * Drops what deleted items mention and what mentions them. Deleted targets' lists go with them,
   * so only the targets of deleted sources are announced.
   */
  removeItems(ids: MentionTargetId[]): void {
    if (ids.length === 0) return;
    // a rebuild reading the files mustn't bring a deleted note's rows back
    for (const id of ids) {
      if (!isId('event', id)) this.rebuildWrites?.add(id);
    }
    const changed = this.db.transaction((tx) => {
      const sourced = tx
        .select({ targetId: mentions.targetId })
        .from(mentions)
        .where(inArray(mentions.sourceId, ids as MentionSourceId[]))
        .all();
      tx.delete(mentions)
        .where(inArray(mentions.sourceId, ids as MentionSourceId[]))
        .run();
      tx.delete(mentions).where(inArray(mentions.targetId, ids)).run();
      const deleted = new Set<string>(ids);
      return [...new Set(sourced.map((row) => row.targetId))].filter((id) => !deleted.has(id));
    });
    if (changed.length > 0) this.changes.emit({ type: 'changed', targetIds: changed });
  }

  /**
   * The items that mention `targetId`, most recently changed first, each with the line it
   * mentions it in. Trashed sources are left out.
   */
  list(targetId: MentionTargetId): Mention[] {
    const rows = this.db.select().from(mentions).where(eq(mentions.targetId, targetId)).all();
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.sourceId);
    const sources = new Map<MentionSourceId, { source: MentionSource; updatedAt: Date }>();

    const taskIds = ids.filter((id): id is TaskId => isId('task', id));
    if (taskIds.length > 0) {
      const found = this.db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(and(inArray(tasks.id, taskIds), isNull(tasks.archivedAt)))
        .all();
      for (const { updatedAt, ...task } of found) {
        sources.set(task.id, { source: { type: 'task', ...task }, updatedAt });
      }
    }
    const projectIds = ids.filter((id): id is ProjectId => isId('project', id));
    if (projectIds.length > 0) {
      const found = this.db
        .select({
          id: projects.id,
          title: projects.title,
          color: projects.color,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(and(inArray(projects.id, projectIds), isNull(projects.archivedAt)))
        .all();
      for (const { updatedAt, ...project } of found) {
        sources.set(project.id, { source: { type: 'project', ...project }, updatedAt });
      }
    }
    const noteIds = ids.filter((id): id is NoteId => isId('note', id));
    if (noteIds.length > 0) {
      const found = this.db
        .select({
          id: notes.id,
          title: notes.title,
          linkedEventId: notes.linkedEventId,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .where(and(inArray(notes.id, noteIds), isNull(notes.archivedAt)))
        .all();
      for (const { updatedAt, ...note } of found) {
        sources.set(note.id, { source: { type: 'note', ...note }, updatedAt });
      }
    }

    return rows
      .flatMap((row): Mention[] => {
        const found = sources.get(row.sourceId);
        if (!found) return [];
        const { count, contextBefore, contextAfter } = row;
        return [{ ...found, count, contextBefore, contextAfter }];
      })
      .sort(
        (a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime() || b.source.id.localeCompare(a.source.id),
      );
  }

  /** how many items mention `targetId`, as `list` counts them */
  count(targetId: MentionTargetId): number {
    return this.list(targetId).length;
  }

  /**
   * Whether a rebuild has ever finished in this workspace. Until one has (a workspace from before
   * mentions), links saved earlier aren't indexed; after it, saves keep the index in step.
   */
  isBuilt(): boolean {
    return isIndexBuilt(this.db, 'mentions');
  }

  /**
   * Indexes every task, project and note again, trashed ones included, reading each note's file.
   * A source saved while the files are read keeps what that save indexed; a note whose file can't
   * be read keeps its rows. Marks the index built (isBuilt) in the same transaction. Resolves to
   * the number of rows. One rebuild runs at a time: a call while one runs gets that one.
   */
  rebuild(): Promise<number> {
    this.rebuilding ??= this.runRebuild().finally(() => {
      this.rebuilding = null;
    });
    return this.rebuilding;
  }

  /** Resolves once a rebuild in progress has settled; the workspace waits on it before closing. */
  async whenIdle(): Promise<void> {
    await this.rebuilding?.catch(() => undefined);
  }

  private async runRebuild(): Promise<number> {
    const written = new Set<MentionSourceId>();
    this.rebuildWrites = written;
    try {
      const noteIds = this.db
        .select({ id: notes.id })
        .from(notes)
        .all()
        .map(({ id }) => id);
      const files = await Promise.allSettled(
        noteIds.map((id) => this.notesService.readContent(id, { includeArchived: true })),
      );
      const contents = new Map<NoteId, string>();
      const unreadable: NoteId[] = [];
      files.forEach((file, i) => {
        if (file.status === 'fulfilled') contents.set(noteIds[i], file.value);
        else {
          unreadable.push(noteIds[i]);
          // the class only: the error quotes the note's file path
          this.logError(`Reading note ${noteIds[i]} for mentions failed`, file.reason);
        }
      });

      return this.db.transaction((tx) => {
        const kept: MentionSourceId[] = [...written, ...unreadable];
        if (kept.length === 0) tx.delete(mentions).run();
        else tx.delete(mentions).where(notInArray(mentions.sourceId, kept)).run();

        const texts: [MentionSourceId, string | null][] = [
          ...tx
            .select({ id: tasks.id, text: tasks.description })
            .from(tasks)
            .all()
            .map(({ id, text }): [MentionSourceId, string | null] => [id, text]),
          ...tx
            .select({ id: projects.id, text: projects.description })
            .from(projects)
            .all()
            .map(({ id, text }): [MentionSourceId, string | null] => [id, text]),
          ...contents,
        ];
        const rows = texts
          .filter(([id, text]) => text && !written.has(id))
          .flatMap(([id, text]) =>
            extractMentions(text!)
              .filter((mention) => mention.targetId !== id)
              .map((mention) => toRow(id, mention)),
          );
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          tx.insert(mentions)
            .values(rows.slice(i, i + INSERT_CHUNK))
            .run();
        }
        markIndexBuilt(tx, 'mentions');
        return tx.select({ id: mentions.sourceId }).from(mentions).all().length;
      });
    } finally {
      this.rebuildWrites = null;
    }
  }

  private logError(message: string, error: unknown): void {
    const line = `${message} error=${errorClass(error)}`;
    if (this.logger) this.logger.error(line);
    else console.error(line);
  }
}

function toRow(sourceId: MentionSourceId, mention: ExtractedMention): MentionRow {
  const { targetId, count, contextBefore, contextAfter } = mention;
  return { sourceId, targetId, count, contextBefore, contextAfter };
}

/** the targets whose row was added, removed or changed between `before` and `after` */
function changedTargets(before: MentionRow[], after: MentionRow[]): MentionTargetId[] {
  const key = (row: MentionRow) =>
    `${row.count}\u0000${row.contextBefore}\u0000${row.contextAfter}`;
  const old = new Map(before.map((row) => [row.targetId, key(row)]));
  const now = new Map(after.map((row) => [row.targetId, key(row)]));
  const ids = new Set([...old.keys(), ...now.keys()]);
  return [...ids].filter((id) => old.get(id) !== now.get(id));
}
