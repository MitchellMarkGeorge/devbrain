import { ExternalSourceId } from '@common/ids';
import { consoleLogger } from '../shared/logger';
import { externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Auth } from '../integrations/auth';
import { CredentialStore } from '../integrations/credential-store';
import { TaskSource } from '../integrations/providers/provider';
import { ProviderRegistry } from '../integrations/providers/registry';
import { LinkState, SourceType, TaskStatus } from '@common/types';
import { ExternalProject } from '../integrations/types';
import { CLOSED_ISSUE_WINDOW_MS } from './constants';
import { SyncStateManager, syncSkipReason } from './sync-state';
import { PendingReconcile } from './syncer';
import {
  ReattachRefusal,
  ReattachResult,
  ReconcileItems,
  ReconcilePlan,
  SyncLogger,
  SyncSkipReason,
} from './types';
import { SyncWriter } from './writer';

// a detached root task and its detached descendants, by external id, to reattach together
export interface ReattachGroup {
  rootExternalId: string;
  descendantExternalIds: string[];
}

export interface TaskReconcilerOptions {
  // for the reads that plan a reconcile pass; writes go through `writer`
  db: BetterSQLite3Database;
  syncState: SyncStateManager;
  credentials: CredentialStore;
  providers: ProviderRegistry;
  writer: SyncWriter;
  logger?: SyncLogger;
  now?: () => Date; // injected for tests
}

/**
 * What a tasks source's pages cannot see, and putting it right: the reconcile pass, and the
 * reattach of detached tasks. Both ask the provider's TaskSource about specific tasks
 * (resolveTasks, resolveProjects) and leave the writing to SyncWriter.
 */
export class TaskReconciler {
  private readonly db: BetterSQLite3Database;
  private readonly syncState: SyncStateManager;
  private readonly credentials: CredentialStore;
  private readonly providers: ProviderRegistry;
  private readonly writer: SyncWriter;
  private readonly logger: SyncLogger;
  private readonly now: () => Date;

  constructor(options: TaskReconcilerOptions) {
    this.db = options.db;
    this.syncState = options.syncState;
    this.credentials = options.credentials;
    this.providers = options.providers;
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
   * 2. Diff them against the watched links (planReconcile), and resolve the candidates and
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
    const plan = this.planReconcile(sourceId, assigned);
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
   * What a reconcile pass has to look up, given the ids of the open items assigned to the viewer
   * now. Reads only.
   *
   * - candidates: watched links (synced, not settled, task still open locally) missing from the
   *   snapshot, so reassigned, deleted or trashed since the last run, or closed in a way the
   *   incremental query has not seen yet
   * - returning: snapshot ids with no synced link: a `removed` link (e.g. restored from the trash,
   *   which leaves updatedAt alone) or none yet. A detached link is the user's own and is skipped
   * - projectIds: this source's synced projects, so one edited or deleted in the provider is
   *   noticed
   */
  private planReconcile(sourceId: ExternalSourceId, assignedIds: string[]): ReconcilePlan {
    const assigned = new Set(assignedIds);
    // served by idx_external_links_source_id_state, then the tasks primary key
    const watched = this.db
      .select({ externalId: externalLinks.externalId })
      .from(externalLinks)
      .innerJoin(tasksTable, eq(tasksTable.id, externalLinks.taskId))
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNull(externalLinks.settledAt),
          notInArray(tasksTable.status, CLOSED_STATUSES),
        ),
      )
      .all();
    const candidates = watched
      .map((link) => link.externalId)
      .filter((externalId) => !assigned.has(externalId));

    // the snapshot's links, by uq_external_links_source_external_id
    const known = new Map<string, LinkState>();
    for (const batch of chunks([...assigned])) {
      const links = this.db
        .select({ externalId: externalLinks.externalId, state: externalLinks.state })
        .from(externalLinks)
        .where(and(eq(externalLinks.sourceId, sourceId), inArray(externalLinks.externalId, batch)))
        .all();
      links.forEach((link) => known.set(link.externalId, link.state));
    }
    const returning = [...assigned].filter((externalId) => {
      const state = known.get(externalId);
      return state === undefined || state === LinkState.REMOVED;
    });

    // served by idx_external_links_source_id_state
    const projectLinks = this.db
      .select({ externalId: externalLinks.externalId })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNotNull(externalLinks.projectId),
        ),
      )
      .all();

    return { candidates, returning, projectIds: projectLinks.map((link) => link.externalId) };
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
   *    lookups of LOOKUP_BATCH_SIZE). Any provider failure throws here, before anything is
   *    written, rejected credentials (IntegrationAuthError) included.
   * 3. Per group, in the order given: refuse it when its root came back gone, unreadable or not
   *    assigned to the viewer; otherwise hand its root and the descendants that came back assigned
   *    to sync through SyncWriter.reattachTasks, each group in its own transaction. Descendants
   *    gone, reassigned or unreadable stay detached. A root no longer detached by then (changed
   *    while the provider answered) is refused alone.
   *
   * Returns each group's result by its root's external id. Unlike a run, rejected credentials do
   * not move the integration to needs_reauth: that is left to the caller, so sync does not depend
   * on IntegrationService. DetachService reports it, and the workspace marks the integration.
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

    // 1.
    const target = this.syncState.getSyncTarget(sourceId);
    const blocked = syncSkipReason(target, this.now());
    if (blocked) return refuseAll(blocked);
    const tasks = this.providers.get(target.provider)?.tasks;
    if (target.sourceType !== SourceType.TASKS || !tasks) {
      return refuseAll(SyncSkipReason.UNSUPPORTED);
    }

    // 2.
    const ids = groups.flatMap((group) => [group.rootExternalId, ...group.descendantExternalIds]);
    const auth = await this.credentials.getAuth(target.integrationId);
    const resolved = await tasks.resolveTasks(auth, ids);
    const found = new Map(resolved.found.map((task) => [task.externalId, task]));
    const gone = new Set(resolved.gone);
    const projects = new Map(resolved.projects.map((project) => [project.externalId, project]));

    // 3.
    let reattached = 0;
    let leftDetachedCount = 0;
    for (const { rootExternalId, descendantExternalIds } of groups) {
      const root = found.get(rootExternalId);
      const refusal = gone.has(rootExternalId)
        ? ReattachRefusal.GONE
        : !root
          ? ReattachRefusal.UNREADABLE
          : !root.assignedToViewer
            ? ReattachRefusal.UNASSIGNED
            : null;
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

// a closed task is not watched: its issue is out of the open-assignment snapshot by design
const CLOSED_STATUSES = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

// keeps an id list under SQLite's bound-parameter limit
const CHUNK_SIZE = 500;
function chunks(ids: string[]): string[][] {
  const result: string[][] = [];
  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    result.push(ids.slice(start, start + CHUNK_SIZE));
  }
  return result;
}
