import { ExternalLinkId, ExternalSourceId, ProjectId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { SearchService } from '../search/service';
import { ExternalProject, ExternalTask, LinkState, Provider } from '../integrations/types';
import { projectLinkMetadataSchema, taskLinkMetadataSchema } from '../integrations/schema';
import { Task, TaskStatus } from '../tasks/types';
import { Project, ProjectStatus } from '../projects/types';
import { NotFoundError } from '../shared/errors';
import { SyncEntityType, SyncSummary, TaskPageItems } from './types';

type Tx = BaseSQLiteDatabase<'sync', RunResult>;
type Link = typeof externalLinks.$inferSelect;

/**
 * The only code that writes external rows. It writes the tables directly, past the service guards
 * that reject edits to synced rows, and only ever writes provider-owned fields: `linkedNoteId`,
 * `linkedEventId` and `favoritedAt` belong to DevBrain and are never touched.
 *
 * Each call is one SQLite transaction, search index writes included. better-sqlite3 nests
 * transactions as savepoints, so the engine can wrap a call in its own transaction to save the
 * cursor alongside the page.
 */
export class SyncWriter {
  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly search: SearchService,
  ) {}

  /**
   * Applies one page: projects first, then tasks parents first, then removals. A task no longer
   * assigned to the viewer (from a lookup) is removed like one in `removedIds`.
   */
  applyTaskPage(sourceId: ExternalSourceId, page: TaskPageItems): SyncSummary {
    return this.db.transaction((tx) => {
      const write = new PageWrite(tx, this.search, sourceId);
      write.upsertProjects(page.projects);
      write.upsertTasks(page.tasks.filter((task) => task.assignedToViewer));
      write.removeTasks([
        ...page.removedIds,
        ...page.tasks.filter((task) => !task.assignedToViewer).map((task) => task.externalId),
      ]);
      return write.finish();
    });
  }

  /** archives the synced tasks behind these ids and marks their links `removed` */
  removeTasks(sourceId: ExternalSourceId, externalIds: string[]): SyncSummary {
    return this.db.transaction((tx) => {
      const write = new PageWrite(tx, this.search, sourceId);
      write.removeTasks(externalIds);
      return write.finish();
    });
  }
}

// one call's writes, inside its transaction
class PageWrite {
  private readonly now = new Date();
  private readonly provider: Provider;
  private inserted = 0;
  private updated = 0;
  private removed = 0;
  private readonly changed = new Set<SyncEntityType>();
  // links whose remote item is unchanged: only lastSyncedAt moves, in one update at the end
  private readonly touched: ExternalLinkId[] = [];

  constructor(
    private readonly tx: Tx,
    private readonly search: SearchService,
    private readonly sourceId: ExternalSourceId,
  ) {
    const source = tx
      .select({ provider: integrations.provider })
      .from(externalSources)
      .innerJoin(integrations, eq(integrations.id, externalSources.integrationId))
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!source) throw new NotFoundError(sourceId);
    this.provider = source.provider;
  }

  upsertProjects(items: ExternalProject[]): void {
    const links = this.findLinks(items.map((item) => item.externalId));
    const written: Project[] = [];

    for (const item of items) {
      const link = links.get(item.externalId);
      const linkFields = {
        ...this.linkFields(item, null),
        metadata: projectLinkMetadataSchema.parse({ statusLabel: item.statusLabel }),
      };

      if (!link) {
        const project = this.tx
          .insert(projects)
          .values({ ...projectFields(item), createdAt: item.createdAt })
          .returning()
          .get();
        this.tx
          .insert(externalLinks)
          .values({ ...linkFields, ...this.newLink(), projectId: project.id })
          .run();
        this.inserted += 1;
        written.push(project);
        continue;
      }

      const projectId = entityId(link, 'projectId');
      if (link.state === LinkState.DETACHED) continue;
      if (link.state === LinkState.SYNCED && !isNewer(item, link)) {
        this.touched.push(link.id);
        continue;
      }

      // remote changed, or a removed project came back: a synced row is never archived
      const project = this.tx
        .update(projects)
        .set({ ...projectFields(item), archivedAt: null })
        .where(eq(projects.id, projectId))
        .returning()
        .get();
      this.tx
        .update(externalLinks)
        .set({ ...linkFields, ...resynced() })
        .where(eq(externalLinks.id, link.id))
        .run();
      this.updated += 1;
      written.push(project);
    }

    this.search.indexProjects(written);
    if (written.length > 0) this.changed.add('project');
  }

  upsertTasks(items: ExternalTask[]): void {
    // parents' links too, so a child can find a parent mirrored in an earlier page
    const links = this.findLinks([
      ...items.map((item) => item.externalId),
      ...items.flatMap((item) => item.parentExternalId ?? []),
    ]);
    const projectIds = this.syncedProjectIds(items.flatMap((item) => item.projectExternalId ?? []));
    // parents that became synced in this call, whose children in earlier pages may be waiting
    const arrived = new Map<string, TaskId>();
    const written: Task[] = [];

    for (const item of parentsFirst(items)) {
      const link = links.get(item.externalId);
      // a parent that is not mirrored (or not synced) leaves the child top-level; its key and
      // title stay in the link metadata for display, and its id lets it adopt the child later
      const parent = item.parentExternalId ? links.get(item.parentExternalId) : undefined;
      const fields = taskFields(item, {
        parentTaskId: parent?.state === LinkState.SYNCED ? parent.taskId : null,
        projectId: item.projectExternalId ? (projectIds.get(item.projectExternalId) ?? null) : null,
      });
      const linkFields = {
        ...this.linkFields(item, item.key),
        metadata: taskLinkMetadataSchema.parse({
          statusLabel: item.statusLabel,
          priorityLabel: item.priorityLabel,
          parentExternalId: item.parentExternalId,
          parentKey: item.parentKey,
          parentTitle: item.parentTitle,
        }),
      };

      if (!link) {
        const task = this.tx
          .insert(tasks)
          .values({ ...fields, createdAt: item.createdAt })
          .returning()
          .get();
        const newLink = this.tx
          .insert(externalLinks)
          .values({ ...linkFields, ...this.newLink(), taskId: task.id })
          .returning()
          .get();
        links.set(item.externalId, newLink);
        arrived.set(item.externalId, task.id);
        this.inserted += 1;
        written.push(task);
        continue;
      }

      const taskId = entityId(link, 'taskId');
      if (link.state === LinkState.DETACHED) continue;
      if (link.state === LinkState.SYNCED && !isNewer(item, link)) {
        this.touched.push(link.id);
        continue;
      }

      // remote changed, or a removed task came back: a synced row is never archived
      const task = this.tx
        .update(tasks)
        .set({ ...fields, archivedAt: null })
        .where(eq(tasks.id, taskId))
        .returning()
        .get();
      const updatedLink = this.tx
        .update(externalLinks)
        .set({ ...linkFields, ...resynced() })
        .where(eq(externalLinks.id, link.id))
        .returning()
        .get();
      if (link.state === LinkState.REMOVED) arrived.set(item.externalId, taskId);
      links.set(item.externalId, updatedLink);
      this.updated += 1;
      written.push(task);
    }

    // re-parenting only moves parentTaskId, so the adopted children need no re-index
    this.updated += this.adoptChildren(arrived);
    this.search.indexTasks(written);
    if (written.length > 0) this.changed.add('task');
  }

  removeTasks(externalIds: string[]): void {
    if (externalIds.length === 0) return;

    // only synced links: a detached task is the user's own and never moves to removed
    const links = this.tx
      .select({ id: externalLinks.id, taskId: externalLinks.taskId })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          inArray(externalLinks.externalId, externalIds),
          eq(externalLinks.state, LinkState.SYNCED),
          isNotNull(externalLinks.taskId),
        ),
      )
      .all();
    if (links.length === 0) return;

    // archived, not deleted, so an issue that comes back keeps its notes and links. Linked notes
    // are left as they are: they are the user's, and the task may well return
    const taskIds = links.map((link) => link.taskId!);
    this.tx.update(tasks).set({ archivedAt: this.now }).where(inArray(tasks.id, taskIds)).run();
    this.tx
      .update(externalLinks)
      .set({ state: LinkState.REMOVED, removedAt: this.now })
      .where(
        inArray(
          externalLinks.id,
          links.map((link) => link.id),
        ),
      )
      .run();
    this.search.removeFromIndex(taskIds);
    this.removed += taskIds.length;
    this.changed.add('task');
  }

  finish(): SyncSummary {
    if (this.touched.length > 0) {
      this.tx
        .update(externalLinks)
        .set({ lastSyncedAt: this.now })
        .where(inArray(externalLinks.id, this.touched))
        .run();
    }
    return {
      inserted: this.inserted,
      updated: this.updated,
      removed: this.removed,
      changed: [...this.changed],
    };
  }

  /** this source's links for these ids, in any state, by external id */
  private findLinks(externalIds: string[]): Map<string, Link> {
    if (externalIds.length === 0) return new Map();
    const links = this.tx
      .select()
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          inArray(externalLinks.externalId, [...new Set(externalIds)]),
        ),
      )
      .all();
    return new Map(links.map((link) => [link.externalId, link]));
  }

  /**
   * external id to local id for the synced projects among these. A detached project is local, and
   * a synced task cannot live in a local project, so a task whose project is not synced has none.
   */
  private syncedProjectIds(externalIds: string[]): Map<string, ProjectId> {
    const ids = new Map<string, ProjectId>();
    for (const link of this.findLinks(externalIds).values()) {
      if (link.state === LinkState.SYNCED && link.projectId)
        ids.set(link.externalId, link.projectId);
    }
    return ids;
  }

  /**
   * Re-parents the synced children, applied in earlier pages, that recorded one of these parents
   * in their link metadata and were left top-level because it was not mirrored then. Returns how
   * many moved.
   */
  private adoptChildren(parents: Map<string, TaskId>): number {
    let adopted = 0;
    for (const [parentExternalId, parentTaskId] of parents) {
      const children = this.tx
        .select({ taskId: externalLinks.taskId })
        .from(externalLinks)
        .where(
          and(
            eq(externalLinks.sourceId, this.sourceId),
            eq(externalLinks.state, LinkState.SYNCED),
            sql`json_extract(${externalLinks.metadata}, '$.parentExternalId') = ${parentExternalId}`,
          ),
        );
      adopted += this.tx
        .update(tasks)
        .set({ parentTaskId })
        .where(and(inArray(tasks.id, children), isNull(tasks.parentTaskId)))
        .run().changes;
    }
    return adopted;
  }

  private linkFields(item: ExternalTask | ExternalProject, externalKey: string | null) {
    return {
      externalId: item.externalId,
      externalKey,
      externalUrl: item.url,
      externalUpdatedAt: item.updatedAt,
      lastSyncedAt: this.now,
    };
  }

  private newLink() {
    return { sourceId: this.sourceId, provider: this.provider, state: LinkState.SYNCED };
  }
}

/** what an update writes to a link besides its fields: synced again, and watched again */
function resynced() {
  return { state: LinkState.SYNCED, removedAt: null, settledAt: null };
}

// provider-owned task fields only; never linkedNoteId, linkedEventId or favoritedAt
function taskFields(
  item: ExternalTask,
  { parentTaskId, projectId }: { parentTaskId: TaskId | null; projectId: ProjectId | null },
) {
  const completed = item.status === TaskStatus.COMPLETED;
  return {
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    startDate: item.startDate,
    dueDate: item.dueDate,
    parentTaskId,
    projectId,
    // the completed_at_consistency check: set exactly when completed, so a provider that omits
    // the time cannot fail the page
    completedAt: completed ? (item.completedAt ?? item.updatedAt) : null,
  };
}

// provider-owned project fields only; never favoritedAt
function projectFields(item: ExternalProject) {
  const completed = item.status === ProjectStatus.COMPLETED;
  return {
    title: item.title,
    description: item.description,
    status: item.status,
    startDate: item.startDate,
    dueDate: item.dueDate,
    color: item.color,
    completedAt: completed ? (item.completedAt ?? item.updatedAt) : null,
  };
}

// "unchanged" is decided by the provider's updatedAt; an older copy (from the cursor overlap)
// never overwrites a newer one
function isNewer(item: ExternalTask | ExternalProject, link: Link): boolean {
  return item.updatedAt.getTime() > link.externalUpdatedAt.getTime();
}

// the entity a link points at; an id shared between a task and a project would be a provider bug
function entityId<K extends 'taskId' | 'projectId'>(link: Link, key: K): NonNullable<Link[K]> {
  const id = link[key];
  if (!id) throw new Error(`External link ${link.id} does not point at a ${key.slice(0, -2)}`);
  return id as NonNullable<Link[K]>;
}

/** the page reordered so every parent in it comes before its children, at any depth */
function parentsFirst(items: ExternalTask[]): ExternalTask[] {
  const byId = new Map(items.map((item) => [item.externalId, item]));
  const ordered: ExternalTask[] = [];
  const visited = new Set<string>();
  const visit = (item: ExternalTask) => {
    // marked before the parent is visited, so a cycle cannot recurse forever
    if (visited.has(item.externalId)) return;
    visited.add(item.externalId);
    const parent = item.parentExternalId ? byId.get(item.parentExternalId) : undefined;
    if (parent) visit(parent);
    ordered.push(item);
  };
  items.forEach(visit);
  return ordered;
}
