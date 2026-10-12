import { EventId, ExternalSourceId, ProjectId, TaskId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { events } from '@main/db/schema/events';
import { externalLinks } from '@main/db/schema/integrations';
import { notes } from '@main/db/schema/notes';
import { tasks } from '@main/db/schema/tasks';
import { projects } from '@main/db/schema/projects';
import { and, eq, exists, inArray, isNotNull, notExists, notInArray, or, sql } from 'drizzle-orm';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { SearchService } from '../search/service';
import { SyncEntityType } from '../sync/types';
import { LinkState } from './types';

// What a disconnect does to an integration's mirrored rows. IntegrationService.previewDisconnect
// and disconnect both go through planDisconnect, so what the dialog states is what happens.

type Tx = BaseSQLiteDatabase<'sync', RunResult>;

export interface EntityCounts {
  tasks: number;
  projects: number;
  events: number;
}

// counts of mirrored items, synced or removed: detached ones are already local and never touched
export interface DisconnectCounts {
  // deleted with their links
  deleted: EntityCounts;
  // kept as local copies: synced ones are detached, removed (archived or hidden) ones stay so
  kept: EntityCounts;
}

export interface DisconnectPlan {
  deleted: { taskIds: TaskId[]; projectIds: ProjectId[]; eventIds: EventId[] };
  kept: { taskIds: TaskId[]; projectIds: ProjectId[]; eventIds: EventId[] };
}

const MIRRORED = [LinkState.SYNCED, LinkState.REMOVED];

/**
 * Sorts the sources' mirrored items, synced or removed, into deleted and kept. With
 * `keepLocalCopies` everything is kept. Otherwise an item is kept when something of the user's
 * points at it, archived things included (they are the user's and may return):
 *
 * - a task with a task note, or with a note or event link of its own;
 * - an event a note or a task links to;
 * - a project with a note filed under it, or a task that outlives the disconnect: a local or
 *   detached task, or a mirrored task kept by the rule above.
 *
 * Everything else is deleted. Detached items are the user's already and are left out.
 */
export function planDisconnect(
  tx: Tx,
  sourceIds: ExternalSourceId[],
  { keepLocalCopies }: { keepLocalCopies: boolean },
): DisconnectPlan {
  const plan: DisconnectPlan = {
    deleted: { taskIds: [], projectIds: [], eventIds: [] },
    kept: { taskIds: [], projectIds: [], eventIds: [] },
  };
  if (sourceIds.length === 0) return plan;
  const mirrored = and(
    inArray(externalLinks.sourceId, sourceIds),
    inArray(externalLinks.state, MIRRORED),
  );

  // tasks: a task note, or a link the user set on the task
  const taskRows = tx
    .select({
      id: tasks.id,
      keep: sql<boolean>`${or(
        isNotNull(tasks.linkedNoteId),
        isNotNull(tasks.linkedEventId),
        exists(tx.select({ id: notes.id }).from(notes).where(eq(notes.linkedTaskId, tasks.id))),
      )}`.mapWith(Boolean),
    })
    .from(externalLinks)
    .innerJoin(tasks, eq(tasks.id, externalLinks.taskId))
    .where(mirrored)
    .all();

  // events: a note or a task links to it
  const eventRows = tx
    .select({
      id: events.id,
      keep: sql<boolean>`${or(
        exists(tx.select({ id: notes.id }).from(notes).where(eq(notes.linkedEventId, events.id))),
        exists(tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.linkedEventId, events.id))),
      )}`.mapWith(Boolean),
    })
    .from(externalLinks)
    .innerJoin(events, eq(events.id, externalLinks.eventId))
    .where(mirrored)
    .all();

  const projectRows = tx
    .select({
      id: projects.id,
      hasNotes: sql<boolean>`${exists(
        tx.select({ id: notes.id }).from(notes).where(eq(notes.projectId, projects.id)),
      )}`.mapWith(Boolean),
    })
    .from(externalLinks)
    .innerJoin(projects, eq(projects.id, externalLinks.projectId))
    .where(mirrored)
    .all();

  for (const row of taskRows) {
    (keepLocalCopies || row.keep ? plan.kept : plan.deleted).taskIds.push(row.id);
  }
  for (const row of eventRows) {
    (keepLocalCopies || row.keep ? plan.kept : plan.deleted).eventIds.push(row.id);
  }

  // projects: decided after tasks, as a kept task keeps its project
  const deletedTasks = new Set(plan.deleted.taskIds);
  const holdingTasks = new Set<ProjectId>();
  if (!keepLocalCopies && projectRows.length > 0) {
    const inProjects = tx
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .where(
        inArray(
          tasks.projectId,
          projectRows.map((row) => row.id),
        ),
      )
      .all();
    for (const task of inProjects) {
      if (!deletedTasks.has(task.id)) holdingTasks.add(task.projectId!);
    }
  }
  for (const row of projectRows) {
    const keep = keepLocalCopies || row.hasNotes || holdingTasks.has(row.id);
    (keep ? plan.kept : plan.deleted).projectIds.push(row.id);
  }
  return plan;
}

export function countPlan(plan: DisconnectPlan): DisconnectCounts {
  const count = (ids: DisconnectPlan['deleted']): EntityCounts => ({
    tasks: ids.taskIds.length,
    projects: ids.projectIds.length,
    events: ids.eventIds.length,
  });
  return { deleted: count(plan.deleted), kept: count(plan.kept) };
}

/**
 * Carries out a plan, inside the caller's transaction, before the integration row is deleted.
 *
 * 1. Children of a deleted task that are kept become top-level, as deleting a task deletes its
 *    subtasks.
 * 2. Delete the deleted items; their links go with them.
 * 3. Detach every synced link left. Removed ones stay removed: their rows are archived or hidden,
 *    and a later connect of the same account can still restore them.
 * 4. Delete the sources' calendars left with no events, which hold nothing of the user's. Kept ones
 *    become local calendars when the cascade nulls their source.
 * 5. Drop the deleted items from search. Kept ones stay indexed as they were.
 *
 * Returns the entity types whose rows changed.
 */
export function applyDisconnect(
  tx: Tx,
  search: SearchService,
  sourceIds: ExternalSourceId[],
  plan: DisconnectPlan,
): SyncEntityType[] {
  const changed = new Set<SyncEntityType>();
  if (sourceIds.length === 0) return [];
  const { taskIds, projectIds, eventIds } = plan.deleted;

  // 1. a synced task only has synced children, but a kept one among them must not go too
  if (taskIds.length > 0) {
    tx.update(tasks)
      .set({ parentTaskId: null })
      .where(and(inArray(tasks.parentTaskId, taskIds), notInArray(tasks.id, taskIds)))
      .run();
  }

  // 2. a deleted project holds no task that is kept, so nothing of the user's loses its project
  if (taskIds.length > 0) {
    tx.delete(tasks).where(inArray(tasks.id, taskIds)).run();
    changed.add('task');
  }
  if (projectIds.length > 0) {
    tx.delete(projects).where(inArray(projects.id, projectIds)).run();
    changed.add('project');
  }
  if (eventIds.length > 0) {
    tx.delete(events).where(inArray(events.id, eventIds)).run();
    changed.add('event');
  }

  // 3.
  const detached = tx
    .update(externalLinks)
    .set({ state: LinkState.DETACHED })
    .where(
      and(inArray(externalLinks.sourceId, sourceIds), eq(externalLinks.state, LinkState.SYNCED)),
    )
    .returning({
      taskId: externalLinks.taskId,
      projectId: externalLinks.projectId,
      eventId: externalLinks.eventId,
    })
    .all();
  for (const link of detached) {
    changed.add(link.taskId ? 'task' : link.projectId ? 'project' : 'event');
  }

  // 4.
  const emptied = tx
    .delete(calendars)
    .where(
      and(
        inArray(calendars.sourceId, sourceIds),
        notExists(
          tx.select({ id: events.id }).from(events).where(eq(events.calendarId, calendars.id)),
        ),
      ),
    )
    .run().changes;
  if (emptied > 0) changed.add('calendar');

  // 5.
  search.removeFromIndex([...taskIds, ...projectIds, ...eventIds]);
  return [...changed];
}
