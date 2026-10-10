import {
  CalendarId,
  EventId,
  ExternalLinkId,
  ExternalSourceId,
  ProjectId,
  TaskId,
} from '@common/ids';
import {
  externalEventExceptions,
  externalLinks,
  externalSources,
  integrations,
} from '@main/db/schema/integrations';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  notInArray,
  or,
  sql,
  SQLWrapper,
} from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { SearchService } from '../search/service';
import {
  ExternalEvent,
  ExternalProject,
  ExternalTask,
  LinkState,
  Provider,
} from '../integrations/types';
import {
  eventLinkMetadataSchema,
  projectLinkMetadataSchema,
  taskLinkMetadataSchema,
} from '../integrations/schema';
import { hasLinkInState } from '../integrations/refs';
import { Task, TaskStatus } from '../tasks/types';
import { Project, ProjectStatus } from '../projects/types';
import { Event } from '../events/types';
import { allDayDates } from '../events/dates';
import { NotFoundError } from '../shared/errors';
import {
  EventPageItems,
  ReattachSummary,
  ReconcileItems,
  ReconcilePlan,
  SyncEntityType,
  SyncSummary,
  TaskPageItems,
} from './types';

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

  /**
   * What a reconcile pass has to look up, given the ids of the open items assigned to the viewer
   * now. Reads only.
   *
   * - candidates: watched links (synced, not settled, task still open locally) missing from the
   *   snapshot, so reassigned, deleted or trashed since the last run, or closed in a way the
   *   incremental query has not seen yet
   * - returning: snapshot ids with no synced link: a `removed` link (e.g. restored from the trash,
   *   which leaves updatedAt alone) or none yet. A detached link is the user's own and is skipped
   * - projectIds: this source's synced projects, so one deleted in the provider is noticed
   */
  planReconcile(sourceId: ExternalSourceId, assignedIds: string[]): ReconcilePlan {
    const assigned = new Set(assignedIds);
    // served by idx_external_links_source_id_state, then the tasks primary key
    const watched = this.db
      .select({ externalId: externalLinks.externalId })
      .from(externalLinks)
      .innerJoin(tasks, eq(tasks.id, externalLinks.taskId))
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNull(externalLinks.settledAt),
          notInArray(tasks.status, CLOSED_STATUSES),
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
   * Applies a reconcile pass, in one transaction, in this order:
   *
   * 1. The lookup, as a page: found and still assigned is upserted (a completion, or a restore of
   *    a removed link); reassigned or gone is removed.
   * 2. Settle: synced task links closed before `settleBefore` stop being watched.
   * 3. Project lifecycle, on the state after 1: a synced project that is gone, or has no synced
   *    tasks left, is detached when it still holds local or detached tasks, and archived with its
   *    link `removed` otherwise.
   */
  applyReconcile(
    sourceId: ExternalSourceId,
    items: ReconcileItems,
    { settleBefore }: { settleBefore: Date },
  ): SyncSummary {
    return this.db.transaction((tx) => {
      const write = new PageWrite(tx, this.search, sourceId);
      // 1.
      write.upsertProjects(items.projects);
      write.upsertTasks(items.tasks.filter((task) => task.assignedToViewer));
      write.removeTasks([
        ...items.gone,
        ...items.tasks.filter((task) => !task.assignedToViewer).map((task) => task.externalId),
      ]);
      // 2.
      write.settle(settleBefore);
      // 3.
      write.retireProjects(items.goneProjects);
      return write.finish();
    });
  }

  /**
   * Hands detached tasks back to sync and overwrites them with the provider's copy. Returns null,
   * having written nothing, when `rootExternalId` is no longer detached.
   *
   * 1. Move the detached links of `items.tasks` to `synced`. Their externalUpdatedAt is cleared,
   *    since the local copy may differ from the provider's at any updatedAt and the unchanged
   *    check would otherwise skip it.
   * 2. A synced task has no local children, so the `leftDetached` tasks under one of them become
   *    top-level.
   * 3. Upsert the projects and tasks as a page does: provider-owned fields are overwritten, and
   *    links, the task note and favoritedAt are kept.
   */
  reattachTasks(
    sourceId: ExternalSourceId,
    rootExternalId: string,
    items: Pick<TaskPageItems, 'tasks' | 'projects'>,
    leftDetached: string[],
  ): ReattachSummary | null {
    return this.db.transaction((tx) => {
      const detached = and(
        eq(externalLinks.sourceId, sourceId),
        eq(externalLinks.state, LinkState.DETACHED),
      );
      const root = tx
        .select({ id: externalLinks.id })
        .from(externalLinks)
        .where(and(detached, eq(externalLinks.externalId, rootExternalId)))
        .get();
      if (!root) return null;

      // 1.
      const reattached = tx
        .update(externalLinks)
        .set({ ...resynced(), externalUpdatedAt: new Date(0) })
        .where(
          and(
            detached,
            inArray(
              externalLinks.externalId,
              items.tasks.map((task) => task.externalId),
            ),
          ),
        )
        .returning({ taskId: externalLinks.taskId })
        .all()
        .map((link) => link.taskId!);

      // 2.
      const stayed = tx
        .select({ taskId: externalLinks.taskId })
        .from(externalLinks)
        .where(and(detached, inArray(externalLinks.externalId, leftDetached)));
      const promoted = tx
        .update(tasks)
        .set({ parentTaskId: null })
        .where(and(inArray(tasks.id, stayed), inArray(tasks.parentTaskId, reattached)))
        .returning({ id: tasks.id })
        .all()
        .map((task) => task.id);

      // 3.
      const write = new PageWrite(tx, this.search, sourceId);
      write.upsertProjects(items.projects);
      write.upsertTasks(items.tasks);
      return { ...write.finish(), reattached, promoted };
    });
  }

  /**
   * Applies one page of events, all from the calendar whose row is `calendarId`. The calendar's
   * row itself is kept current by IntegrationService.refreshCalendars at the start of each run.
   *
   * 1. Upsert the live events, masters before their occurrences. An occurrence (a moved or edited
   *    occurrence of a series) is its own row, pointed at its series. A master that is new here
   *    adopts what came before it: occurrence rows, and cancelled occurrences parked for it.
   * 2. Record the cancelled occurrences against their series, or park them until it arrives.
   * 3. Remove what was cancelled or deleted, by the removal rule.
   *
   * No rule text is edited: a series' rule stays as the provider wrote it, and what it no longer
   * has is in event_exceptions and its occurrence rows (EventService reads it as exdates).
   */
  applyEventPage(
    sourceId: ExternalSourceId,
    calendarId: CalendarId,
    page: EventPageItems,
  ): SyncSummary {
    return this.db.transaction((tx) => {
      const write = new PageWrite(tx, this.search, sourceId);
      // 1.
      write.upsertEvents(
        calendarId,
        page.events.filter((event) => !event.cancelled),
      );
      // 2.
      const cancelled = page.events.filter((event) => event.cancelled);
      write.excludeOccurrences(cancelled);
      // 3. a cancelled occurrence that had been moved or edited has a row of its own, which goes
      write.removeEvents([...page.cancelledIds, ...cancelled.map((event) => event.externalId)]);
      return write.finish();
    });
  }

  /**
   * Takes a deselected calendar's events out of scope by the removal rule, and forgets the
   * cancelled occurrences parked for it, so selecting it again starts clean.
   */
  removeCalendarEvents(sourceId: ExternalSourceId, calendarId: CalendarId): SyncSummary {
    return this.db.transaction((tx) => {
      const write = new PageWrite(tx, this.search, sourceId);
      write.removeCalendar(calendarId);
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

/**
 * One writer call's work, inside its transaction. The upsert and remove methods write rows and
 * keep count as they go; `finish` does the deferred writes and returns the summary. Every query
 * is scoped to `sourceId`.
 */
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
    // the provider is stamped on new links, so it is read once; an unknown source fails the call
    const source = tx
      .select({ provider: integrations.provider })
      .from(externalSources)
      .innerJoin(integrations, eq(integrations.id, externalSources.integrationId))
      .where(eq(externalSources.id, sourceId))
      .get();
    if (!source) throw new NotFoundError(sourceId);
    this.provider = source.provider;
  }

  /**
   * Upserts the page's projects by the link-state table. Runs before `upsertTasks`, so the tasks
   * in the same page can find their project.
   *
   * 1. Look up the existing links for every project in one query.
   * 2. Per project: no link → insert; synced and unchanged → touch only; otherwise (changed,
   *    removed, or detached) → update and restore. A project is only ever detached by sync, when
   *    it left scope still holding the user's tasks, so it is reattached the moment it returns.
   * 3. Index everything inserted or updated in one batch.
   */
  upsertProjects(items: ExternalProject[]): void {
    // 1. existing links, by external id
    const links = this.findLinks(items.map((item) => item.externalId));
    const written: Project[] = [];

    for (const item of items) {
      const link = links.get(item.externalId);
      // what both the insert and the update write to the link
      const linkFields = {
        ...this.linkFields(item, null),
        metadata: projectLinkMetadataSchema.parse({ statusLabel: item.statusLabel }),
      };

      // 2a. never seen: insert the project, then its link
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
      // 2b. unchanged: the row is not written, so updatedAt stays put; lastSyncedAt moves in finish
      if (link.state === LinkState.SYNCED && !isNewer(item, link)) {
        this.touched.push(link.id);
        continue;
      }

      // 2c. remote changed, or a removed or detached project came back: write the provider-owned
      // fields and unarchive (a synced row is never archived), then mark the link synced again.
      // A detached project's local and detached tasks stay in it; its link is reused, so there is
      // no duplicate
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

    // 3. re-index what was written, and tell the renderer to refetch projects
    this.search.indexProjects(written);
    if (written.length > 0) this.changed.add('project');
  }

  /**
   * Upserts the page's tasks by the link-state table, after `upsertProjects`.
   *
   * 1. Look up the links of the page's tasks and of their parents, and the local ids of their
   *    projects, in one query each.
   * 2. Walk the tasks parents first, resolving each one's parent and project, then: no link →
   *    insert; detached → skip; synced and unchanged → touch only; otherwise → update and restore.
   * 3. Re-parent children from earlier pages whose parent was inserted or restored here.
   * 4. Index everything inserted or updated in one batch.
   */
  upsertTasks(items: ExternalTask[]): void {
    // 1. parents' links too, so a child can find a parent mirrored in an earlier page
    const links = this.findLinks([
      ...items.map((item) => item.externalId),
      ...items.flatMap((item) => item.parentExternalId ?? []),
    ]);
    const projectIds = this.syncedProjectIds(items.flatMap((item) => item.projectExternalId ?? []));
    // parents that became synced in this call, whose children in earlier pages may be waiting
    const arrived = new Map<string, TaskId>();
    const written: Task[] = [];

    // 2. parents first, so a parent in this page is already written when its children come up
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

      // 2a. never seen: insert the task and its link; it may be the parent children are waiting for
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
        // later children in this page resolve their parent from the map
        links.set(item.externalId, newLink);
        arrived.set(item.externalId, task.id);
        this.inserted += 1;
        written.push(task);
        continue;
      }

      const taskId = entityId(link, 'taskId');
      // 2b. detached: the user's own now, so sync leaves it alone
      if (link.state === LinkState.DETACHED) continue;
      // 2c. unchanged: the row is not written, so updatedAt stays put; lastSyncedAt moves in finish
      if (link.state === LinkState.SYNCED && !isNewer(item, link)) {
        this.touched.push(link.id);
        continue;
      }

      // 2d. remote changed, or a removed task came back: write the provider-owned fields and
      // unarchive (a synced row is never archived), then mark the link synced again
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
      // a restored task can adopt children too, and later children here see it as synced
      if (link.state === LinkState.REMOVED) arrived.set(item.externalId, taskId);
      links.set(item.externalId, updatedLink);
      this.updated += 1;
      written.push(task);
    }

    // 3. re-parenting only moves parentTaskId, so the adopted children need no re-index
    this.updated += this.adoptChildren(arrived);
    // 4. re-index what was written, and tell the renderer to refetch tasks
    this.search.indexTasks(written);
    if (written.length > 0) this.changed.add('task');
  }

  /**
   * Takes the tasks behind these ids out of scope.
   *
   * 1. Find their synced task links; other ids (detached, already removed, never mirrored) are
   *    ignored.
   * 2. Archive the tasks and mark their links `removed`.
   * 3. Drop the tasks from search.
   */
  removeTasks(externalIds: string[]): void {
    if (externalIds.length === 0) return;

    // 1. only synced links: a detached task is the user's own and never moves to removed
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

    // 2. archived, not deleted, so an issue that comes back keeps its notes and links. Linked notes
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
    // 3. removed rows are no longer searchable; a restore re-indexes them
    this.search.removeFromIndex(taskIds);
    this.removed += taskIds.length;
    this.changed.add('task');
  }

  /**
   * Marks synced task links closed before `before` as settled, so reconcile stops watching them.
   * A completed task closed at its completedAt. A cancelled one keeps no close time, so its
   * provider's updatedAt stands in: the issue changed when it was cancelled, so an issue unchanged
   * since `before` was cancelled before it too. A reopened issue comes back through the
   * incremental pull, whose update clears settledAt.
   */
  settle(before: Date): void {
    // per link, one seek on the tasks primary key
    const closedBefore = this.tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, externalLinks.taskId),
          or(
            and(eq(tasks.status, TaskStatus.COMPLETED), lt(tasks.completedAt, before)),
            and(
              eq(tasks.status, TaskStatus.CANCELLED),
              lt(externalLinks.externalUpdatedAt, before),
            ),
          ),
        ),
      );
    // links only: the task rows and their updatedAt are not written
    this.tx
      .update(externalLinks)
      .set({ settledAt: this.now })
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNull(externalLinks.settledAt),
          exists(closedBefore),
        ),
      )
      .run();
  }

  /**
   * The project lifecycle. Runs after the call's task changes, so "no synced tasks" is read on
   * the final state.
   *
   * 1. Find this source's synced projects that left scope, in one query: gone in the provider, or
   *    with no synced tasks left in them. Usually it finds none, and nothing else runs.
   * 2. A gone project's synced tasks follow the provider, which no longer has the project, so
   *    they lose it. (Tasks that moved elsewhere were already moved by the upsert.)
   * 3. One still holding local or detached tasks is detached: a normal local project, where the
   *    user's own tasks keep their home. Any other one is archived, not deleted, so notes filed
   *    under it keep their link, and its link is marked `removed`.
   */
  retireProjects(goneExternalIds: string[]): void {
    const gone = new Set(goneExternalIds);
    // live synced tasks in the project the outer row links to; a synced task is never archived,
    // and saying so lets idx_tasks_project_id serve this
    const syncedTasksIn = (projectId: SQLWrapper) =>
      and(
        eq(tasks.projectId, projectId),
        isNull(tasks.archivedAt),
        hasLinkInState('task', tasks.id, LinkState.SYNCED),
      );

    // 1. served by idx_external_links_source_id_state, with one seek per project for its tasks
    const empty = notExists(
      this.tx.select({ id: tasks.id }).from(tasks).where(syncedTasksIn(externalLinks.projectId)),
    );
    const leaving = this.tx
      .select({
        id: externalLinks.id,
        externalId: externalLinks.externalId,
        projectId: externalLinks.projectId,
      })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNotNull(externalLinks.projectId),
          gone.size > 0 ? or(inArray(externalLinks.externalId, [...gone]), empty) : empty,
        ),
      )
      .all();
    if (leaving.length === 0) return;
    const archived: ProjectId[] = [];

    for (const link of leaving) {
      const projectId = link.projectId!;

      // 2. a synced task cannot live in a local or archived project; an empty project has none
      if (gone.has(link.externalId)) {
        const moved = this.tx
          .update(tasks)
          .set({ projectId: null })
          .where(syncedTasksIn(sql`${projectId}`))
          .run().changes;
        if (moved > 0) this.changed.add('task');
      }

      // 3. live tasks that are not synced are local or detached; a removed task is archived
      const keeps = this.tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectId),
            isNull(tasks.archivedAt),
            sql`NOT ${hasLinkInState('task', tasks.id, LinkState.SYNCED)}`,
          ),
        )
        .limit(1)
        .get();
      if (keeps) {
        this.tx
          .update(externalLinks)
          .set({ state: LinkState.DETACHED })
          .where(eq(externalLinks.id, link.id))
          .run();
      } else {
        this.tx
          .update(projects)
          .set({ archivedAt: this.now })
          .where(eq(projects.id, projectId))
          .run();
        this.tx
          .update(externalLinks)
          .set({ state: LinkState.REMOVED, removedAt: this.now })
          .where(eq(externalLinks.id, link.id))
          .run();
        archived.push(projectId);
        this.removed += 1;
      }
      this.changed.add('project');
    }

    // archived projects are no longer searchable; a restore re-indexes them
    this.search.removeFromIndex(archived);
  }

  /**
   * Upserts live events by the link-state table, all into one calendar.
   *
   * 1. Look up the links of the events, and of the masters of their occurrences, in one query.
   * 2. Walk the masters first, so an occurrence finds a master inserted in this page. Per event:
   *    no link → insert; detached → skip; synced and unchanged → touch only; otherwise (changed,
   *    or removed) → update and restore. An occurrence points at its master's row, if mirrored.
   * 3. Every master inserted or restored here adopts what came before it.
   * 4. Index everything inserted or updated in one batch.
   */
  upsertEvents(calendarId: CalendarId, items: ExternalEvent[]): void {
    // 1.
    const links = this.findLinks([
      ...items.map((item) => item.externalId),
      ...items.flatMap((item) => item.recurringEventExternalId ?? []),
    ]);
    const arrived = new Map<string, EventId>();
    const written: Event[] = [];

    // 2.
    for (const item of mastersFirst(items)) {
      const link = links.get(item.externalId);
      const master = item.recurringEventExternalId
        ? links.get(item.recurringEventExternalId)
        : undefined;
      const fields = eventFields(item, calendarId, master?.eventId ?? null);
      const linkFields = {
        ...this.linkFields(item, null),
        metadata: eventLinkMetadataSchema.parse({
          calendarId: item.calendarId,
          recurringEventExternalId: item.recurringEventExternalId,
        }),
      };

      // 2a. never seen: insert the event, then its link; a master may have occurrences waiting
      if (!link) {
        const event = this.tx
          .insert(events)
          .values({ ...fields, createdAt: item.createdAt })
          .returning()
          .get();
        const newLink = this.tx
          .insert(externalLinks)
          .values({ ...linkFields, ...this.newLink(), eventId: event.id })
          .returning()
          .get();
        // later occurrences in this page resolve their master from the map
        links.set(item.externalId, newLink);
        if (item.recurrenceRule !== null) arrived.set(item.externalId, event.id);
        this.inserted += 1;
        written.push(event);
        continue;
      }

      const eventId = entityId(link, 'eventId');
      // 2b. detached: the user's own now, so sync leaves it alone
      if (link.state === LinkState.DETACHED) continue;
      // 2c. unchanged: the row is not written, so updatedAt stays put; lastSyncedAt moves in finish
      if (link.state === LinkState.SYNCED && !isNewer(item, link)) {
        this.touched.push(link.id);
        continue;
      }

      // 2d. remote changed, or a cancelled event came back: write the provider-owned fields, then
      // mark the link synced again, which shows it on the calendar again
      const event = this.tx
        .update(events)
        .set(fields)
        .where(eq(events.id, eventId))
        .returning()
        .get();
      const updatedLink = this.tx
        .update(externalLinks)
        .set({ ...linkFields, ...resynced() })
        .where(eq(externalLinks.id, link.id))
        .returning()
        .get();
      links.set(item.externalId, updatedLink);
      if (link.state === LinkState.REMOVED && item.recurrenceRule !== null) {
        arrived.set(item.externalId, eventId);
      }
      this.updated += 1;
      written.push(event);
    }

    // 3.
    for (const [masterExternalId, seriesId] of arrived)
      this.adoptSeries(masterExternalId, seriesId);
    // 4.
    this.search.indexEvents(written);
    if (written.length > 0) this.changed.add('event');
  }

  /**
   * A master that has just arrived takes in what came before it: occurrence rows applied without
   * their series (adopted, as subtasks are), and cancelled occurrences parked for it (moved to
   * event_exceptions). Both are found by the master's external id.
   */
  private adoptSeries(masterExternalId: string, seriesId: EventId): void {
    const parked = and(
      eq(externalEventExceptions.sourceId, this.sourceId),
      eq(externalEventExceptions.masterExternalId, masterExternalId),
    );
    const starts = this.tx
      .select({ originalStartAt: externalEventExceptions.originalStartAt })
      .from(externalEventExceptions)
      .where(parked)
      .all();
    if (starts.length > 0) {
      this.tx
        .insert(eventExceptions)
        .values(starts.map(({ originalStartAt }) => ({ seriesId, originalStartAt })))
        .onConflictDoNothing()
        .run();
      this.tx.delete(externalEventExceptions).where(parked).run();
      this.changed.add('event');
    }

    // the occurrence links that recorded this master in their metadata
    const occurrences = this.tx
      .select({ eventId: externalLinks.eventId })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          sql`json_extract(${externalLinks.metadata}, '$.recurringEventExternalId') = ${masterExternalId}`,
        ),
      );
    const adopted = this.tx
      .update(events)
      .set({ seriesId })
      .where(and(inArray(events.id, occurrences), isNull(events.seriesId)))
      .run().changes;
    this.updated += adopted;
    if (adopted > 0) this.changed.add('event');
  }

  /**
   * Records cancelled occurrences against their series: an event_exceptions row when the master
   * is mirrored, else a parked row its arrival will take in. Ones already recorded are left as
   * they are, so a page read twice records nothing new.
   */
  excludeOccurrences(items: ExternalEvent[]): void {
    if (items.length === 0) return;
    const masters = this.findLinks(items.map((item) => item.recurringEventExternalId!));
    for (const item of items) {
      const master = masters.get(item.recurringEventExternalId!);
      if (master?.eventId) {
        const recorded = this.tx
          .insert(eventExceptions)
          .values({ seriesId: master.eventId, originalStartAt: item.originalStartAt! })
          .onConflictDoNothing()
          .run().changes;
        // the series shows one occurrence fewer
        if (recorded > 0) {
          this.updated += 1;
          this.changed.add('event');
        }
        continue;
      }
      this.tx
        .insert(externalEventExceptions)
        .values({
          sourceId: this.sourceId,
          calendarId: item.calendarId,
          masterExternalId: item.recurringEventExternalId!,
          originalStartAt: item.originalStartAt!,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  /**
   * Takes the events behind these ids out of scope, with the modified occurrences of any series
   * among them.
   */
  removeEvents(externalIds: string[]): void {
    if (externalIds.length === 0) return;
    const ids = [...new Set(externalIds)];
    // only synced links: a removed event is already out of scope
    const links = this.tx
      .select({ id: externalLinks.id, eventId: externalLinks.eventId })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNotNull(externalLinks.eventId),
          or(
            inArray(externalLinks.externalId, ids),
            // the occurrence rows of a cancelled series go with it
            inArray(
              sql`json_extract(${externalLinks.metadata}, '$.recurringEventExternalId')`,
              ids,
            ),
          ),
        ),
      )
      .all();
    this.removeEventLinks(links);
    // nothing parked for a cancelled series will be wanted
    this.tx
      .delete(externalEventExceptions)
      .where(
        and(
          eq(externalEventExceptions.sourceId, this.sourceId),
          inArray(externalEventExceptions.masterExternalId, ids),
        ),
      )
      .run();
  }

  /** a deselected calendar's synced events, and the cancelled occurrences parked for it */
  removeCalendar(calendarId: CalendarId): void {
    const calendar = this.tx
      .select({ externalId: calendars.externalId })
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), eq(calendars.sourceId, this.sourceId)))
      .get();
    if (!calendar) throw new NotFoundError(calendarId);

    const links = this.tx
      .select({ id: externalLinks.id, eventId: externalLinks.eventId })
      .from(externalLinks)
      .innerJoin(events, eq(events.id, externalLinks.eventId))
      .where(
        and(
          eq(externalLinks.sourceId, this.sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          eq(events.calendarId, calendarId),
        ),
      )
      .all();
    this.removeEventLinks(links);
    if (calendar.externalId !== null) {
      this.tx
        .delete(externalEventExceptions)
        .where(
          and(
            eq(externalEventExceptions.sourceId, this.sourceId),
            eq(externalEventExceptions.calendarId, calendar.externalId),
          ),
        )
        .run();
    }
  }

  /**
   * The removal rule for events, which have no archivedAt: deleting a row would leave a note or
   * task that points at it pointing nowhere.
   *
   * 1. Find which of the events a note or task links to.
   * 2. Those are kept, with their links marked `removed`; the calendar hides them and the note
   *    can still resolve its event.
   * 3. The rest are deleted, their links with them.
   * 4. Drop all of them from search.
   */
  private removeEventLinks(links: { id: ExternalLinkId; eventId: EventId | null }[]): void {
    if (links.length === 0) return;
    const eventIds = links.map((link) => link.eventId!);

    // 1. a link from a note or a task, archived ones included: they are the user's and may return
    const linked = new Set<EventId>([
      ...this.tx
        .select({ id: notes.linkedEventId })
        .from(notes)
        .where(inArray(notes.linkedEventId, eventIds))
        .all()
        .map((row) => row.id!),
      ...this.tx
        .select({ id: tasks.linkedEventId })
        .from(tasks)
        .where(inArray(tasks.linkedEventId, eventIds))
        .all()
        .map((row) => row.id!),
    ]);

    // 2. kept for what links to them
    const kept = links.filter((link) => linked.has(link.eventId!));
    if (kept.length > 0) {
      this.tx
        .update(externalLinks)
        .set({ state: LinkState.REMOVED, removedAt: this.now })
        .where(
          inArray(
            externalLinks.id,
            kept.map((link) => link.id),
          ),
        )
        .run();
    }
    // 3. nothing links to the rest; the link cascades with the row
    const deleted = eventIds.filter((id) => !linked.has(id));
    if (deleted.length > 0) {
      this.tx.delete(events).where(inArray(events.id, deleted)).run();
    }

    // 4. neither kind is searchable any more; a restore re-indexes a kept one
    this.search.removeFromIndex(eventIds);
    this.removed += eventIds.length;
    this.changed.add('event');
  }

  /**
   * Ends the call: records that the unchanged items were seen, in one update for all of them,
   * and returns the summary.
   */
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
      // the synced links that recorded this parent in their metadata
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
      // only those still top-level; children already under the parent are not written again
      adopted += this.tx
        .update(tasks)
        .set({ parentTaskId })
        .where(and(inArray(tasks.id, children), isNull(tasks.parentTaskId)))
        .run().changes;
    }
    return adopted;
  }

  /** the link columns taken from the provider item, written on insert and on update */
  private linkFields(
    item: ExternalTask | ExternalProject | ExternalEvent,
    externalKey: string | null,
  ) {
    return {
      externalId: item.externalId,
      externalKey,
      externalUrl: item.url,
      externalUpdatedAt: item.updatedAt,
      lastSyncedAt: this.now,
    };
  }

  /** the link columns set only on insert: which source it belongs to, and synced from the start */
  private newLink() {
    return { sourceId: this.sourceId, provider: this.provider, state: LinkState.SYNCED };
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

// provider-owned event fields; never favoritedAt. An all-day event from a provider that sent no
// dates gets the local days of its instants
function eventFields(item: ExternalEvent, calendarId: CalendarId, seriesId: EventId | null) {
  const dates =
    item.allDay && (item.startDate === null || item.endDate === null)
      ? allDayDates(item.startAt, item.endAt)
      : { startDate: item.startDate, endDate: item.endDate };
  return {
    calendarId,
    title: item.title,
    description: item.description,
    startAt: item.startAt,
    endAt: item.endAt,
    allDay: item.allDay,
    startDate: item.allDay ? dates.startDate : null,
    endDate: item.allDay ? dates.endDate : null,
    timeZone: item.timeZone,
    location: item.location,
    recurrenceRule: item.recurrenceRule,
    seriesId,
    originalStartAt: item.originalStartAt,
    status: item.status,
    response: item.response,
    kind: item.kind,
    meetingUrl: item.meetingUrl,
    color: item.color,
  };
}

/** the page reordered so every series master in it comes before its occurrences */
function mastersFirst(items: ExternalEvent[]): ExternalEvent[] {
  return [
    ...items.filter((item) => item.recurrenceRule !== null),
    ...items.filter((item) => item.recurrenceRule === null),
  ];
}

// "unchanged" is decided by the provider's updatedAt; an older copy (from the cursor overlap)
// never overwrites a newer one
function isNewer(item: ExternalTask | ExternalProject | ExternalEvent, link: Link): boolean {
  return item.updatedAt.getTime() > link.externalUpdatedAt.getTime();
}

// the entity a link points at; an id shared between a task and a project would be a provider bug
function entityId<K extends 'taskId' | 'projectId' | 'eventId'>(
  link: Link,
  key: K,
): NonNullable<Link[K]> {
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
