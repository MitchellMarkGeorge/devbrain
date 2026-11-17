import { ExternalSourceId } from '@common/ids';
import { consoleLogger, type Logger } from '../shared/logger';
import { Auth } from '../integrations/auth';
import { TaskSource } from '../integrations/providers/provider';
import { SourceType } from '@common/types';
import { ExternalProject, ExternalTask } from '../integrations/types';
import { CLOSED_ISSUE_WINDOW_MS } from './constants';
import type { IntegrationService } from '../integrations/service';
import { PendingReconcile } from './syncer';
import { ReattachRefusal, ReattachResult, ReconcileItems, SyncSkipReason } from './types';
import { SyncReader } from './reader';
import { SyncWriter } from './writer';

// a detached root task and its detached descendants, by external id, to reattach together
export interface ReattachGroup {
  rootExternalId: string;
  descendantExternalIds: string[];
}

export interface TaskReconcilerOptions {
  // the reads that plan a reconcile pass; writes go through `writer`
  reader: SyncReader;
  // the gate, the provider and auth for a reattach, which is not a run
  integrations: Pick<IntegrationService, 'withSource'>;
  writer: SyncWriter;
  logger?: Logger;
  now?: () => Date; // injected for tests
}

/**
 * What a tasks source's pages cannot see, and putting it right: the reconcile pass, and the
 * reattach of detached tasks. Both ask the provider's TaskSource about specific tasks
 * (resolveTasks, resolveProjects) and leave the writing to SyncWriter.
 */
export class TaskReconciler {
  private readonly reader: SyncReader;
  private readonly integrations: Pick<IntegrationService, 'withSource'>;
  private readonly writer: SyncWriter;
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(options: TaskReconcilerOptions) {
    this.reader = options.reader;
    this.integrations = options.integrations;
    this.writer = options.writer;
    this.logger = options.logger ?? consoleLogger;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * The reads of one reconcile pass, which finds what the incremental pull cannot: tasks
   * reassigned away, deleted or restored from the trash, and projects edited, deleted or left out
   * of scope. The engine runs it through TaskSyncer.reconcile, and applies the writes it returns in
   * its transaction.
   *
   * 1. Ask the provider for the ids of the open tasks assigned to the viewer now.
   * 2. Diff them against the watched links (SyncReader.reconcilePlan), and resolve the candidates and
   *    returning tasks, if any.
   * 3. Resolve the source's mirrored projects, on every pass. Incremental pulls see a project only
   *    inside a changed task, so this is what brings in a project edited or deleted while its
   *    tasks stayed the same. Most passes resolve no tasks, so this is their one request after the
   *    snapshot, and a source that mirrors no projects makes none.
   * 4. Return the writes: apply what was resolved, settle closed tasks past the window and run the
   *    project lifecycle, in one call (SyncWriter.applyReconcile).
   *
   * Returns null, having written nothing, when the signal aborts between provider calls.
   */
  async reconcile(
    sourceId: ExternalSourceId,
    tasks: TaskSource,
    auth: Auth,
    signal?: AbortSignal,
  ): Promise<PendingReconcile | null> {
    // 1.
    const assigned = await tasks.listOpenAssignedTaskIds(auth, { signal });
    if (signal?.aborted) return null;

    // 2.
    const plan = this.reader.reconcilePlan(sourceId, assigned);
    const ids = [...plan.candidates, ...plan.returning];
    const resolved =
      ids.length > 0
        ? await tasks.resolveTasks(auth, ids, { signal })
        : { found: [], projects: [], gone: [], skipped: 0 };
    if (signal?.aborted) return null;

    // 3.
    const projects =
      plan.projectIds.length > 0
        ? await tasks.resolveProjects(auth, plan.projectIds, { signal })
        : { found: [], gone: [], skipped: 0 };
    if (signal?.aborted) return null;

    // the found tasks' projects, then the requested ones, each once
    const byId = new Map<string, ExternalProject>();
    [...resolved.projects, ...projects.found].forEach((project) =>
      byId.set(project.externalId, project),
    );
    const items: ReconcileItems = {
      tasks: resolved.found,
      projects: [...byId.values()],
      gone: resolved.gone,
      goneProjects: projects.gone,
    };

    // 4.
    return {
      skipped: resolved.skipped + projects.skipped,
      apply: () => {
        const settleBefore = new Date(this.now().getTime() - CLOSED_ISSUE_WINDOW_MS);
        return this.writer.applyReconcile(sourceId, items, { settleBefore });
      },
    };
  }

  /**
   * Refreshes detached tasks from the provider and hands them back to sync: the reattach behind
   * DetachService. Not a run: no cursor moves, no outcome is recorded on the source, and a run in
   * flight is not waited for, as each write is its own transaction. One root and its detached
   * descendants; see reattachGroups.
   */
  async reattachTasks(
    sourceId: ExternalSourceId,
    rootExternalId: string,
    descendantExternalIds: string[],
  ): Promise<ReattachResult> {
    const results = await this.reattachGroups(sourceId, [
      { rootExternalId, descendantExternalIds },
    ]);
    return results.get(rootExternalId)!;
  }

  /**
   * reattachTasks for several roots of one source at once, from a single provider lookup:
   * DetachService.reattachKept hands back every task a disconnect kept this way.
   *
   * 1. Refuse every group, as a run would be skipped, when the source or its integration is off,
   *    the integration needs re-authentication, the provider asked to wait, or it has no tasks.
   * 2. Resolve every root and descendant in one resolveTasks call (the provider splits it into
   *    lookups of LOOKUP_BATCH_SIZE), through IntegrationService.withSource. Any provider failure throws
   *    here, before anything is written. Rejected credentials (IntegrationAuthError) move the
   *    integration to needs_reauth first, as in a run.
   * 3. Per group, in the order given: refuse it when its root came back gone, unreadable or not
   *    assigned to the viewer; otherwise hand its root and the descendants that came back assigned
   *    to sync through SyncWriter.reattachTasks, each group in its own transaction. Descendants
   *    gone, reassigned or unreadable stay detached. A root no longer detached by then (changed
   *    while the provider answered) is refused alone.
   *
   * Returns each group's result by its root's external id.
   */
  async reattachGroups(
    sourceId: ExternalSourceId,
    groups: ReattachGroup[],
  ): Promise<Map<string, ReattachResult>> {
    const results = new Map<string, ReattachResult>();
    const refuseAll = (reason: SyncSkipReason) => {
      for (const group of groups) results.set(group.rootExternalId, { ok: false, reason });
      return results;
    };
    if (groups.length === 0) return results;

    // 1-2.
    const ids = groups.flatMap((group) => [group.rootExternalId, ...group.descendantExternalIds]);
    const lookup = await this.integrations.withSource(
      sourceId,
      SourceType.TASKS,
      ({ source, auth }) => source.resolveTasks(auth, ids),
    );
    if (!lookup.ok) return refuseAll(lookup.reason);
    const resolved = lookup.value;
    const found = new Map(resolved.found.map((task) => [task.externalId, task]));
    const gone = new Set(resolved.gone);
    const projects = new Map(resolved.projects.map((project) => [project.externalId, project]));

    // 3.
    let reattached = 0;
    let leftDetachedCount = 0;
    for (const { rootExternalId, descendantExternalIds } of groups) {
      const refusal = rootRefusal(rootExternalId, found, gone);
      if (refusal) {
        results.set(rootExternalId, { ok: false, reason: refusal });
        continue;
      }

      const groupIds = [rootExternalId, ...descendantExternalIds];
      const assigned = groupIds.flatMap((id) => {
        const task = found.get(id);
        return task?.assignedToViewer ? [task] : [];
      });
      const leftDetached = groupIds.filter((id) => !found.get(id)?.assignedToViewer);
      // the projects of this group's tasks, so each write files them as a page would
      const groupProjects = [
        ...new Set(assigned.flatMap((task) => task.projectExternalId ?? [])),
      ].flatMap((id) => projects.get(id) ?? []);
      const summary = this.writer.reattachTasks(
        sourceId,
        rootExternalId,
        { tasks: assigned, projects: groupProjects },
        leftDetached,
      );
      if (!summary) {
        results.set(rootExternalId, { ok: false, reason: ReattachRefusal.CHANGED });
        continue;
      }
      reattached += summary.reattached.length;
      leftDetachedCount += leftDetached.length;
      results.set(rootExternalId, { ok: true, summary });
    }
    this.logger.info(
      `Reattached ${reattached} task(s) on ${sourceId} from ${groups.length} root(s), ` +
        `${leftDetachedCount} left detached`,
    );
    return results;
  }
}

// Why a root can't be reattached from the provider's answer, or null when it can: deleted or
// trashed, came back unreadable, or no longer assigned to the viewer
function rootRefusal(
  rootExternalId: string,
  found: ReadonlyMap<string, ExternalTask>,
  gone: ReadonlySet<string>,
): ReattachRefusal | null {
  if (gone.has(rootExternalId)) return ReattachRefusal.GONE;
  const root = found.get(rootExternalId);
  if (!root) return ReattachRefusal.UNREADABLE;
  if (!root.assignedToViewer) return ReattachRefusal.UNASSIGNED;
  return null;
}
