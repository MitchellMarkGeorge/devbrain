import { ExternalSourceId, IntegrationId, TaskId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks } from '@main/db/schema/tasks';
import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ReattachGroup, TaskReconciler } from '../sync/task-reconciler';
import {
  type KeptCopies,
  LinkState,
  type ReattachKeptResult,
  SyncEntityType,
  Task,
} from '@common/types';
import { ReattachRefusal, ReattachSummary, SyncSkipReason } from '../sync/types';
import { subtreeOf } from '../tasks/subtree';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import type { Logger } from '../shared/logger';
import { DetachError, NotFoundError } from '../shared/errors';
import { assertRowNotTrashed } from '../shared/trash';
import { withExternalRef } from './refs';
import { KEPT_BY_DISCONNECT } from './schema';

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

// What changed, for in-process subscribers. `kept_local`: the user chose to keep an account's kept copies local, so they are no
// longer offered for reattaching (the tasks themselves are unchanged). Ids only, never credentials.
export type TaskLinkChange =
  | TaskLinkStateChange
  | { type: 'kept_local'; integrationId: IntegrationId; taskIds: TaskId[] };

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
 * A reattach whose credentials are rejected throws IntegrationAuthError, having moved the
 * integration to needs_reauth, as a sync run's rejected credentials would (SourceAccess.call).
 */
export class DetachService {
  // the change is already committed, so a failing listener must not fail the call or the others
  private readonly changes: ChangeListeners<TaskLinkChange>;

  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly reconciler: TaskReconciler,
    options: { logger?: Pick<Logger, 'error'> } = {},
  ) {
    this.changes = new ChangeListeners<TaskLinkChange>('Task link', options);
  }

  /**
   * Makes a synced task, and every synced task below it at any depth, local again, in one
   * transaction. The rows are untouched, so the user keeps the provider's last values and can edit
   * them from here; sync skips detached links from then on.
   *
   * Throws NotFoundError for an unknown task, AlreadyArchivedError for one in the trash, and
   * DetachError for one with no link or one that is not synced.
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

    this.changes.emit({ type: 'detached', taskId: id, taskIds, changed: [SyncEntityType.TASK] });
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
   * Throws NotFoundError for an unknown task, AlreadyArchivedError for one in the trash,
   * DetachError for every refusal, and IntegrationAuthError, having moved the integration to
   * needs_reauth, when the provider rejects the credentials. The task stays detached on any
   * failure.
   */
  async reattachTask(id: TaskId): Promise<Task> {
    const { sourceId, key, group } = this.prepareReattach(id);

    // 3. the provider's copy, written by sync
    const result = await this.reconciler.reattachTasks(
      sourceId,
      group.rootExternalId,
      group.descendantExternalIds,
    );
    if (!result.ok) {
      throw new DetachError(id, `Task ${key} can't be reattached ${REFUSALS[result.reason]}`);
    }
    this.emitReattached(id, result.summary);
    return this.getTask(id);
  }

  /**
   * Steps 1 and 2 of reattachTask, which reads no provider: what to hand the reconciler for the
   * task, or the refusal. Throws NotFoundError for an archived or unknown task and DetachError for
   * every refusal, worded for the user.
   */
  private prepareReattach(id: TaskId): {
    sourceId: ExternalSourceId;
    key: string;
    group: ReattachGroup;
  } {
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
    const descendants = subtree.filter(
      (row) =>
        row.taskId !== id && row.state === LinkState.DETACHED && row.sourceId === link.sourceId,
    );
    return {
      sourceId: link.sourceId,
      key,
      group: {
        rootExternalId: link.externalId,
        descendantExternalIds: descendants.map((row) => row.externalId!),
      },
    };
  }

  private emitReattached(id: TaskId, { reattached, promoted, changed }: ReattachSummary): void {
    this.changes.emit({
      type: 'reattached',
      taskId: id,
      taskIds: [...reattached, ...promoted],
      changed: [...new Set([SyncEntityType.TASK, ...changed])],
    });
  }

  /**
   * How many of the integration's tasks are kept copies: detached by a disconnect of the same
   * account (KEPT_BY_DISCONNECT), matched back to this integration's tasks source by a sync since
   * it was connected again, and active. Tasks the user detached are not counted. A kept copy the
   * sync has not seen yet still has no source, so the count grows as the first sync runs.
   */
  keptCopies(integrationId: IntegrationId): KeptCopies {
    this.assertIntegration(integrationId);
    const row = this.db
      .select({ tasks: count() })
      .from(externalLinks)
      .innerJoin(tasks, eq(tasks.id, externalLinks.taskId))
      .where(this.kept(integrationId))
      .get();
    return { tasks: row?.tasks ?? 0 };
  }

  /**
   * Reattaches every kept copy of the integration (see keptCopies), overwriting what the user
   * changed in them since the disconnect: each one whose parent is not a kept copy too, which
   * takes its kept subtasks with it, as reattachTask would.
   *
   * 1. Check each root as reattachTask does (prepareReattach); one it refuses (holding local
   *    subtasks) goes to `failed` with the reason.
   * 2. Hand the rest to TaskReconciler.reattachGroups, one call per source (an integration has one
   *    tasks source): a single provider lookup for all of them, then a write per root.
   * 3. A root the reconciler refuses (gone, reassigned, its source switched off) stays a local
   *    copy, still offered, and goes to `failed`; each one reattached sends `reattached`.
   *
   * A provider failure throws before anything is written, so nothing is half done. Rejected
   * credentials throw IntegrationAuthError, having moved the integration to needs_reauth.
   */
  async reattachKept(integrationId: IntegrationId): Promise<ReattachKeptResult> {
    const before = this.keptCopies(integrationId).tasks;
    const rows = this.db
      .select({ taskId: tasks.id, parentTaskId: tasks.parentTaskId })
      .from(externalLinks)
      .innerJoin(tasks, eq(tasks.id, externalLinks.taskId))
      .where(this.kept(integrationId))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .all();
    const keptIds = new Set(rows.map((row) => row.taskId));
    const roots = rows.filter((row) => row.parentTaskId === null || !keptIds.has(row.parentTaskId));

    // 1.
    const failed: ReattachKeptResult['failed'] = [];
    const bySource = new Map<
      ExternalSourceId,
      { taskId: TaskId; key: string; group: ReattachGroup }[]
    >();
    for (const { taskId } of roots) {
      try {
        const { sourceId, key, group } = this.prepareReattach(taskId);
        bySource.set(sourceId, [...(bySource.get(sourceId) ?? []), { taskId, key, group }]);
      } catch (error) {
        if (!(error instanceof DetachError || error instanceof NotFoundError)) throw error;
        failed.push({ taskId, message: error.message });
      }
    }

    for (const [sourceId, sourceRoots] of bySource) {
      // 2.
      const results = await this.reconciler.reattachGroups(
        sourceId,
        sourceRoots.map((root) => root.group),
      );
      // 3.
      for (const { taskId, key, group } of sourceRoots) {
        const result = results.get(group.rootExternalId)!;
        if (result.ok) this.emitReattached(taskId, result.summary);
        else {
          failed.push({
            taskId,
            message: `Task ${key} can't be reattached ${REFUSALS[result.reason]}`,
          });
        }
      }
    }
    return { reattached: before - this.keptCopies(integrationId).tasks, failed };
  }

  /**
   * Keeps the integration's kept copies local: they stay detached, as the tasks the user detached
   * do, and are no longer offered for reattaching. Each can still be reattached on its own.
   */
  keepKeptLocal(integrationId: IntegrationId): void {
    this.assertIntegration(integrationId);
    const taskIds = this.db
      .update(externalLinks)
      .set({
        metadata: sql`json_remove(${externalLinks.metadata}, ${`$.${KEPT_BY_DISCONNECT}`})`,
      })
      .where(this.kept(integrationId))
      .returning({ taskId: externalLinks.taskId })
      .all()
      .map((row) => row.taskId!);
    if (taskIds.length === 0) return;
    this.changes.emit({ type: 'kept_local', integrationId, taskIds });
  }

  // returns a function that unsubscribes the listener
  onChange(listener: TaskLinkChangeListener): () => void {
    return this.changes.add(listener);
  }

  /**
   * the link of an active task; an unknown task is not found, one in the trash refused with
   * AlreadyArchivedError (it opens read-only), a local one refused with DetachError
   */
  private activeTaskLink(id: TaskId): Link {
    const row = this.db
      .select({ link: externalLinks, archivedAt: tasks.archivedAt })
      .from(tasks)
      .leftJoin(externalLinks, eq(externalLinks.taskId, tasks.id))
      .where(eq(tasks.id, id))
      .get();
    if (!row) throw new NotFoundError(id);
    assertRowNotTrashed({ id, archivedAt: row.archivedAt });
    if (!row.link) throw new DetachError(id, `Task ${id} is a local task with no integration`);
    return row.link;
  }

  /**
   * The integration's kept task links: detached by a disconnect and matched back to one of its
   * sources. Archived tasks are left out where the query joins tasks.
   */
  private kept(integrationId: IntegrationId) {
    return and(
      inArray(
        externalLinks.sourceId,
        this.db
          .select({ id: externalSources.id })
          .from(externalSources)
          .where(eq(externalSources.integrationId, integrationId)),
      ),
      eq(externalLinks.state, LinkState.DETACHED),
      isNotNull(externalLinks.taskId),
      sql`json_extract(${externalLinks.metadata}, ${`$.${KEPT_BY_DISCONNECT}`}) = 1`,
      // keepKeptLocal updates links, so the active check is a subquery rather than a join
      inArray(
        externalLinks.taskId,
        this.db.select({ id: tasks.id }).from(tasks).where(isNull(tasks.archivedAt)),
      ),
    );
  }

  private assertIntegration(id: IntegrationId): void {
    const row = this.db
      .select({ id: integrations.id })
      .from(integrations)
      .where(eq(integrations.id, id))
      .get();
    if (!row) throw new NotFoundError(id);
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
