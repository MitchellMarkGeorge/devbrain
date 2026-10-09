import { ExternalLinkId, TaskId } from '@common/ids';
import { externalLinks } from '@main/db/schema/integrations';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SyncWriter } from '../sync/writer';
import { SyncEntityType } from '../sync/types';
import { subtreeOf } from '../tasks/subtree';
import { Task } from '../tasks/types';
import { DetachError, NotFoundError } from '../shared/errors';
import { CredentialStore } from './credential-store';
import { ProviderRegistry } from './providers/registry';
import { withRef } from './refs';
import { IntegrationService } from './service';
import { IntegrationStatus, LinkState } from './types';

// What changed, for in-process subscribers; the IPC layer will forward it so the renderer refetches
// the tasks, and the projects too when a reattach wrote one
export interface TaskLinkChange {
  type: 'detached' | 'reattached';
  // the task asked for
  taskId: TaskId;
  // every task whose link changed state: the task and the part of its subtree that moved with it
  taskIds: TaskId[];
  changed: SyncEntityType[];
}

export type TaskLinkChangeListener = (change: TaskLinkChange) => void;

export interface DetachServiceOptions {
  integrations: IntegrationService;
  credentials: CredentialStore;
  providers: ProviderRegistry;
  writer: SyncWriter;
}

type Link = typeof externalLinks.$inferSelect;

/**
 * Detach and reattach of external tasks. Detach turns a synced task and its subtree into local
 * copies that remember where they came from; reattach hands them back to the provider and refreshes
 * them from it.
 *
 * Kept apart from IntegrationService, which owns connections and sources: reattach needs the
 * provider lookup and SyncWriter on top of it, and SyncEngine already sits on IntegrationService the
 * same way. The workspace exposes both methods as `workspace.integrations.detachTask` and
 * `reattachTask`.
 */
export class DetachService {
  private readonly integrations: IntegrationService;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  private readonly listeners = new Set<TaskLinkChangeListener>();

  constructor(
    private readonly db: BetterSQLite3Database,
    options: DetachServiceOptions,
  ) {
    this.integrations = options.integrations;
    this.credentials = options.credentials;
    this.providers = options.providers;
    this.writer = options.writer;
  }

  /**
   * Makes a synced task, and every synced task below it at any depth, local again, in one
   * transaction. The rows are untouched, so the user keeps the provider's last values and can edit
   * them from here; sync skips detached links from then on.
   *
   * Throws NotFoundError for an archived or unknown task, and DetachError for one with no link or
   * one that is not synced.
   */
  async detachTask(id: TaskId): Promise<Task> {
    const taskIds = this.db.transaction((tx) => {
      const link = this.activeTaskLink(id);
      if (link.state !== LinkState.SYNCED) {
        throw new DetachError(id, `Task ${link.externalKey ?? id} is already detached`);
      }

      // a synced task has only synced children, so the whole subtree moves; removed ones are
      // archived and stay removed, so sync can still restore them
      return tx
        .update(externalLinks)
        .set({ state: LinkState.DETACHED })
        .where(
          and(
            inArray(externalLinks.taskId, subtreeOf(id)),
            eq(externalLinks.state, LinkState.SYNCED),
          ),
        )
        .returning({ taskId: externalLinks.taskId })
        .all()
        .map((row) => row.taskId!);
    });

    this.emit({ type: 'detached', taskId: id, taskIds, changed: ['task'] });
    return this.getTask(id);
  }

  /**
   * Hands a detached task back to the provider and refreshes it, with its detached subtree.
   *
   * 1. The task must be detached, active, and have no local subtasks anywhere below it: a synced
   *    task never has local children, and sync archives a removed task on its own, which would
   *    leave such children live under an archived row.
   * 2. Its source must still exist (a disconnect nulls it) and be enabled, and its integration
   *    connected.
   * 3. Look up the task and its detached descendants. The task itself must still resolve and be
   *    assigned to the viewer; otherwise this throws and it stays detached.
   * 4. In one transaction, set the links that came back assigned to `synced`, then apply the fresh
   *    items through SyncWriter. Provider-owned fields are overwritten; links, the task note and
   *    `favoritedAt` are DevBrain's and kept. Descendants that are gone or reassigned stay
   *    detached and become top-level, as a synced task has no local children.
   *
   * Throws NotFoundError for an archived or unknown task, and DetachError for every refusal.
   */
  async reattachTask(id: TaskId): Promise<Task> {
    // 1. the task, and what sits below it
    const link = this.activeTaskLink(id);
    const key = link.externalKey ?? id;
    if (link.state !== LinkState.DETACHED) {
      throw new DetachError(id, `Task ${key} is not detached`);
    }
    const subtree = this.activeSubtree(id);
    const local = subtree.filter(
      (row) =>
        row.linkId === null || (row.state === LinkState.DETACHED && row.sourceId !== link.sourceId),
    );
    if (local.length > 0) {
      throw new DetachError(
        id,
        `Task ${key} has local subtasks. Promote them or move them to another task first`,
      );
    }

    // 2. a source to reattach to
    const sourceId = link.sourceId;
    if (sourceId === null) {
      throw new DetachError(
        id,
        `Task ${key} can't be reattached because its integration was disconnected`,
      );
    }
    const target = this.integrations.getSyncTarget(sourceId);
    if (target.status !== IntegrationStatus.CONNECTED) {
      throw new DetachError(
        id,
        target.status === IntegrationStatus.NEEDS_REAUTH
          ? `Task ${key} can't be reattached until its integration is reconnected`
          : `Task ${key} can't be reattached while its integration is disabled`,
      );
    }
    if (!target.enabled) {
      throw new DetachError(id, `Task ${key} can't be reattached while its source is turned off`);
    }
    const taskSource = this.providers.get(target.provider)?.tasks;
    if (!taskSource) {
      throw new DetachError(id, `Task ${key} can't be reattached: ${target.provider} has no tasks`);
    }

    // 3. the provider's current copy of the task and its detached descendants
    const detached = subtree.filter(
      (row) => row.state === LinkState.DETACHED && row.sourceId === sourceId,
    );
    const auth = await this.credentials.getAuth(target.integrationId);
    const result = await taskSource.lookup(
      auth,
      detached.map((row) => row.externalId!),
    );
    const found = new Map(result.tasks.map((task) => [task.externalId, task]));
    const fresh = found.get(link.externalId);
    if (!fresh || result.gone.includes(link.externalId)) {
      throw new DetachError(
        id,
        result.gone.includes(link.externalId)
          ? `Task ${key} can't be reattached because it no longer exists in ${target.provider}`
          : `Task ${key} can't be reattached because ${target.provider} returned it unreadable`,
      );
    }
    if (!fresh.assignedToViewer) {
      throw new DetachError(
        id,
        `Task ${key} can't be reattached because it is no longer assigned to you`,
      );
    }

    // 4. back to synced, then refreshed
    const rejoining = detached.flatMap((row) => {
      const item = found.get(row.externalId!);
      return item?.assignedToViewer ? [{ ...row, linkId: row.linkId!, item }] : [];
    });
    const { taskIds, summary } = this.db.transaction((tx) => {
      // the lookup was async; a link that moved meanwhile is left as it now is
      const resynced = tx
        .update(externalLinks)
        .set({
          state: LinkState.SYNCED,
          // the writer skips an item no newer than its link, and the local copy may differ from
          // the provider's at any updatedAt, so the stored one is cleared to force the overwrite
          externalUpdatedAt: new Date(0),
          removedAt: null,
          settledAt: null,
        })
        .where(
          and(
            inArray(
              externalLinks.id,
              rejoining.map((row) => row.linkId),
            ),
            eq(externalLinks.state, LinkState.DETACHED),
          ),
        )
        .returning({ id: externalLinks.id })
        .all();
      const ids = new Set<ExternalLinkId>(resynced.map((row) => row.id));
      if (!ids.has(link.id)) throw new DetachError(id, `Task ${key} changed while reattaching`);
      const rejoined = rejoining.filter((row) => ids.has(row.linkId));

      // descendants left detached are local, and a synced task has no local children, so those
      // under a task that rejoined become top-level
      const rejoinedIds = new Set(rejoined.map((row) => row.taskId));
      const leftBehind = subtree
        .filter((row) => row.parentTaskId !== null && rejoinedIds.has(row.parentTaskId))
        .filter((row) => !rejoinedIds.has(row.taskId))
        .map((row) => row.taskId);
      if (leftBehind.length > 0) {
        tx.update(tasks).set({ parentTaskId: null }).where(inArray(tasks.id, leftBehind)).run();
      }

      // the writer's transaction nests as a savepoint, so the state change and the refresh commit
      // together. A lookup carries no projects: a task whose project is mirrored and synced finds
      // it, and one whose project is not gets none until sync brings it
      const summary = this.writer.applyTaskPage(sourceId, {
        projects: [],
        tasks: rejoined.map((row) => row.item),
        removedIds: [],
      });
      return { taskIds: [...rejoinedIds, ...leftBehind], summary };
    });

    this.emit({
      type: 'reattached',
      taskId: id,
      taskIds,
      changed: [...new Set<SyncEntityType>(['task', ...summary.changed])],
    });
    return this.getTask(id);
  }

  // returns a function that unsubscribes the listener
  onChange(listener: TaskLinkChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(change: TaskLinkChange): void {
    // the change is already committed, so a failing listener must not fail the call or the others
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('A task link change listener threw:', error);
      }
    }
  }

  /** the link of an active task; an archived or unknown task is not found, a local one refused */
  private activeTaskLink(id: TaskId): Link {
    const row = this.db
      .select({ link: externalLinks })
      .from(tasks)
      .leftJoin(externalLinks, eq(externalLinks.taskId, tasks.id))
      .where(and(eq(tasks.id, id), isNull(tasks.archivedAt)))
      .get();
    if (!row) throw new NotFoundError(id);
    if (!row.link) throw new DetachError(id, `Task ${id} is a local task with no integration`);
    return row.link;
  }

  /**
   * The task and its active descendants at any depth, with their links. Archived rows are left
   * out, as archiving takes the whole subtree below them too.
   */
  private activeSubtree(id: TaskId) {
    return this.db
      .select({
        taskId: tasks.id,
        parentTaskId: tasks.parentTaskId,
        linkId: externalLinks.id,
        state: externalLinks.state,
        sourceId: externalLinks.sourceId,
        externalId: externalLinks.externalId,
      })
      .from(tasks)
      .leftJoin(externalLinks, eq(externalLinks.taskId, tasks.id))
      .where(and(inArray(tasks.id, subtreeOf(id)), isNull(tasks.archivedAt)))
      .all();
  }

  private async getTask(id: TaskId): Promise<Task> {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!row) throw new NotFoundError(id);
    return withRef(this.db, row);
  }
}
