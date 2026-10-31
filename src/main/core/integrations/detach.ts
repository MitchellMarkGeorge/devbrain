import { ExternalSourceId, IntegrationId, TaskId } from '@common/ids';
import { externalLinks, externalSources } from '@main/db/schema/integrations';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { TaskReconciler } from '../sync/task-reconciler';
import { ReattachRefusal, ReattachResult, SyncEntityType, SyncSkipReason } from '../sync/types';
import { subtreeOf } from '../tasks/subtree';
import { Task } from '../tasks/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { DetachError, IntegrationAuthError, NotFoundError } from '../shared/errors';
import { withExternalRef } from './refs';
import { LinkState } from './types';

// A detach or reattach; the IPC layer will forward it so the renderer refetches the tasks, and the
// projects too when a reattach wrote one
export interface TaskLinkStateChange {
  type: 'detached' | 'reattached';
  // the task asked for
  taskId: TaskId;
  // every task whose link changed state: the task and the part of its subtree that moved with it
  taskIds: TaskId[];
  changed: SyncEntityType[];
}

// What changed, for in-process subscribers. `credentials_rejected`: the provider refused a
// reattach's credentials, which only a reconnect can fix, so the workspace moves the integration to
// needs_reauth. Ids only, never credentials.
export type TaskLinkChange =
  | TaskLinkStateChange
  | { type: 'credentials_rejected'; taskId: TaskId; integrationId: IntegrationId };

export type TaskLinkChangeListener = ChangeListener<TaskLinkChange>;

type Link = typeof externalLinks.$inferSelect;

// what each refusal from the reconciler tells the user, after "Task ENG-123 can't be reattached"
const REFUSALS: Record<SyncSkipReason | ReattachRefusal, string> = {
  [SyncSkipReason.SOURCE_DISABLED]: 'while its source is turned off',
  [SyncSkipReason.INTEGRATION_DISABLED]: 'while its integration is disabled',
  [SyncSkipReason.NEEDS_REAUTH]: 'until its integration is reconnected',
  [SyncSkipReason.RATE_LIMITED]: 'yet: the provider asked DevBrain to wait. Try again shortly',
  [SyncSkipReason.ALREADY_RUNNING]: 'yet. Try again shortly',
  [SyncSkipReason.INITIAL_SYNC_PENDING]: 'yet. Try again shortly',
  [SyncSkipReason.UNSUPPORTED]: 'because its provider has no tasks',
  [ReattachRefusal.GONE]: 'because it no longer exists',
  [ReattachRefusal.UNASSIGNED]: 'because it is no longer assigned to you',
  [ReattachRefusal.UNREADABLE]: 'because its provider returned it unreadable',
  [ReattachRefusal.CHANGED]: 'because it changed while reattaching',
};

/**
 * Detach and reattach of external tasks. Detach turns a synced task and its subtree into local
 * copies that remember where they came from; reattach hands them back to the provider and refreshes
 * them from it.
 *
 * This service owns the rules about the task tree and the messages the user sees. Talking to the
 * provider and writing the refreshed rows is sync's job, through TaskReconciler.reattachTasks.
 *
 * A reattach whose credentials are rejected throws IntegrationAuthError and sends a
 * `credentials_rejected` change, which the workspace answers by moving the integration to
 * needs_reauth, as a sync run's rejected credentials would.
 */
export class DetachService {
  // the change is already committed, so a failing listener must not fail the call or the others
  private readonly changes = new ChangeListeners<TaskLinkChange>('Task link');

  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly reconciler: TaskReconciler,
  ) {}

  /**
   * Makes a synced task, and every synced task below it at any depth, local again, in one
   * transaction. The rows are untouched, so the user keeps the provider's last values and can edit
   * them from here; sync skips detached links from then on.
   *
   * Throws NotFoundError for an archived or unknown task, and DetachError for one with no link or
   * one that is not synced.
   */
  detachTask(id: TaskId): Task {
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

    this.changes.emit({ type: 'detached', taskId: id, taskIds, changed: ['task'] });
    return this.getTask(id);
  }

  /**
   * Hands a detached task back to the provider and refreshes it, with its detached subtree.
   *
   * 1. The task must be detached, active, and have no local subtasks anywhere below it: a synced
   *    task never has local children, and sync archives a removed task on its own, which would
   *    leave such children live under an archived row.
   * 2. Its source must still exist; a disconnect nulls it.
   * 3. TaskReconciler.reattachTasks does the rest: it checks the source and integration, resolves
   *    the task and its detached descendants, and refreshes those still assigned. Provider-owned
   *    fields are overwritten; links, the task note and `favoritedAt` are kept. Descendants that
   *    are gone or reassigned stay detached and become top-level. When it refuses, the task stays
   *    detached.
   *
   * Throws NotFoundError for an archived or unknown task, DetachError for every refusal, and
   * IntegrationAuthError, after sending `credentials_rejected`, when the provider rejects the
   * credentials. The task stays detached on any failure.
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
    if (link.sourceId === null) {
      throw new DetachError(
        id,
        `Task ${key} can't be reattached because its integration was disconnected`,
      );
    }
    // read now: a disconnect while the provider answers would delete the source
    const integrationId = this.integrationOf(link.sourceId);

    // 3. the provider's copy, written by sync
    const descendants = subtree.filter(
      (row) =>
        row.taskId !== id && row.state === LinkState.DETACHED && row.sourceId === link.sourceId,
    );
    let result: ReattachResult;
    try {
      result = await this.reconciler.reattachTasks(
        link.sourceId,
        link.externalId,
        descendants.map((row) => row.externalId!),
      );
    } catch (error) {
      // only a reconnect fixes rejected credentials
      if (error instanceof IntegrationAuthError) {
        this.changes.emit({ type: 'credentials_rejected', taskId: id, integrationId });
      }
      throw error;
    }
    if (!result.ok) {
      throw new DetachError(id, `Task ${key} can't be reattached ${REFUSALS[result.reason]}`);
    }

    const { reattached, promoted, changed } = result.summary;
    this.changes.emit({
      type: 'reattached',
      taskId: id,
      taskIds: [...reattached, ...promoted],
      changed: [...new Set<SyncEntityType>(['task', ...changed])],
    });
    return this.getTask(id);
  }

  // returns a function that unsubscribes the listener
  onChange(listener: TaskLinkChangeListener): () => void {
    return this.changes.add(listener);
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

  /** a link's source always exists: deleting one nulls the sourceId of its links */
  private integrationOf(sourceId: ExternalSourceId): IntegrationId {
    const row = this.db
      .select({ integrationId: externalSources.integrationId })
      .from(externalSources)
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!row) throw new NotFoundError(sourceId);
    return row.integrationId;
  }

  /**
   * The task and its active descendants at any depth, with their links. Archived rows are left
   * out, as archiving takes the whole subtree below them too.
   */
  private activeSubtree(id: TaskId) {
    return this.db
      .select({
        taskId: tasks.id,
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

  private getTask(id: TaskId): Task {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!row) throw new NotFoundError(id);
    return withExternalRef(this.db, row);
  }
}
