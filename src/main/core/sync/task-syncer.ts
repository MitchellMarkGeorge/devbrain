import { Auth } from '../integrations/auth';
import { AssignedTasksQuery, TaskSource } from '../integrations/providers/provider';
import { CLOSED_ISSUE_WINDOW_MS, CURSOR_OVERLAP_MS } from './constants';
import { SyncWriter } from './writer';
import { ActiveSync, PendingReconcile, ReconcileContext, RunContext, Syncer } from './syncer';
import { TaskCursor, taskCursorSchema } from './task-cursor';
import { TaskReconciler } from './task-reconciler';
import { SyncCursor, TaskSyncPage } from './types';

/**
 * A tasks source's run: pages of the viewer's assigned tasks from the provider's TaskSource,
 * applied by SyncWriter.applyTaskPage, with the cursor that says where the next page starts.
 *
 * Two modes, both walking tasks in the order they last changed:
 *
 * - initial: open tasks, and those closed in the last CLOSED_ISSUE_WINDOW_MS (closedSince). A
 *   missing or unreadable cursor starts one.
 * - incremental: tasks changed since the cursor's updatedSince (changedSince), which stays fixed
 *   while the walk pages, so it sees a stable result set.
 *
 * Every page reports its latest change, and the cursor tracks the latest seen across the walk
 * (maxUpdatedAt). After the last page it becomes the next incremental cursor, minus
 * CURSOR_OVERLAP_MS: a change committed while the walk ran may carry an earlier time, and upserts
 * are idempotent, so re-reading the overlap is harmless. The cursor never moves backwards, and an
 * initial walk that found nothing starts incremental from now.
 *
 * The reconcile pass (what pages cannot see: reassignments, deletions, restores) is
 * TaskReconciler's.
 */
export class TaskSyncer implements Syncer {
  readonly cursorSchema = taskCursorSchema;

  constructor(
    private readonly writer: SyncWriter,
    private readonly tasks: TaskSource,
    private readonly reconciler: TaskReconciler,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start({ sourceId, auth, cursor, signal }: RunContext): Promise<ActiveSync<TaskSyncPage>> {
    return {
      cursor,
      pull: (current) => this.pull(auth, current, signal),
      apply: (page) => this.writer.applyTaskPage(sourceId, page),
    };
  }

  reconcile({
    sourceId,
    target,
    auth,
    signal,
  }: ReconcileContext): Promise<PendingReconcile | null> {
    return this.reconciler.reconcile(sourceId, target, this.tasks, auth, signal);
  }

  // one page from the source, and the cursor after it
  async pull(auth: Auth, cursor: SyncCursor | null, signal?: AbortSignal): Promise<TaskSyncPage> {
    const current = readCursor(cursor);
    const query: AssignedTasksQuery =
      current.mode === 'initial'
        ? { closedSince: this.isoAgo(CLOSED_ISSUE_WINDOW_MS) }
        : { changedSince: current.updatedSince };
    if (current.after) query.pageToken = current.after;

    const page = await this.tasks.getAssignedTaskPage(auth, query, { signal });

    // the latest change seen across the walk, archiving included
    let maxUpdatedAt = current.maxUpdatedAt ?? null;
    if (page.latestChange !== null && (maxUpdatedAt === null || page.latestChange > maxUpdatedAt)) {
      maxUpdatedAt = page.latestChange;
    }

    const done = page.nextPageToken === null;
    return {
      tasks: page.tasks,
      projects: page.projects,
      removedIds: page.trashedIds,
      skipped: page.skipped,
      done,
      nextCursor: done
        ? this.nextIncremental(current, maxUpdatedAt)
        : nextPage(current, page.nextPageToken!, maxUpdatedAt),
    };
  }

  // after the last page: changes since the latest change seen, minus the overlap
  private nextIncremental(current: TaskCursor, maxUpdatedAt: string | null): TaskCursor {
    if (maxUpdatedAt === null) {
      // nothing seen: keep the incremental cursor, or start from now after an empty initial sync
      return {
        mode: 'incremental',
        updatedSince:
          current.mode === 'incremental' ? current.updatedSince : this.isoAgo(CURSOR_OVERLAP_MS),
      };
    }
    let since = new Date(new Date(maxUpdatedAt).getTime() - CURSOR_OVERLAP_MS).toISOString();
    // never move the cursor backwards
    if (current.mode === 'incremental' && since < current.updatedSince) {
      since = current.updatedSince;
    }
    return { mode: 'incremental', updatedSince: since };
  }

  private isoAgo(ms: number): string {
    return new Date(this.now().getTime() - ms).toISOString();
  }
}

function readCursor(cursor: SyncCursor | null): TaskCursor {
  const parsed = taskCursorSchema.safeParse(cursor);
  // a missing or unreadable cursor starts a fresh initial sync
  return parsed.success ? parsed.data : { mode: 'initial', after: null, maxUpdatedAt: null };
}

function nextPage(current: TaskCursor, after: string, maxUpdatedAt: string | null): TaskCursor {
  if (current.mode === 'initial') {
    return { mode: 'initial', after, maxUpdatedAt };
  }
  // updatedSince stays fixed until the last page, so the walk sees a stable result set
  return {
    mode: 'incremental',
    updatedSince: current.updatedSince,
    after,
    ...(maxUpdatedAt !== null && { maxUpdatedAt }),
  };
}
