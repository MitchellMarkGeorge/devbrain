import { TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, count, inArray, isNull, ne, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { withExternalRefs } from '../integrations/refs';
import {
  eventSummaries,
  noteSummaries,
  projectSummaries,
  taskSummaries,
  uniqueIds,
} from '../shared/summaries';
import { SubtaskListItem, Task, TaskListItem, TaskLinkSummary, TaskStatus } from './types';

// counts the rows matching `predicate`; count(<boolean>) would count every row
const countWhere = (predicate: SQL) =>
  sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

/**
 * Adds everything a task row in the task list shows beside its own fields: its provider ref
 * (`external`, from withExternalRefs), its subtask progress, its parent, its project and its link. One
 * query per kind for the whole page, never one per row. Archived parents, subtasks, projects and
 * notes are left out, as every list leaves them out.
 */
export function withListDetails(db: BetterSQLite3Database, rows: Task[]): TaskListItem[] {
  const parents = taskSummaries(db, uniqueIds(rows.map((row) => row.parentTaskId)));
  return withSubtaskListDetails(db, rows).map((row) => ({
    ...row,
    parentTask: (row.parentTaskId && parents.get(row.parentTaskId)) || null,
  }));
}

/**
 * The same, for a task's subtask list: everything but the parent, which is the task being viewed.
 */
export function withSubtaskListDetails(db: BetterSQLite3Database, rows: Task[]): SubtaskListItem[] {
  if (rows.length === 0) return [];

  const progress = new Map(
    db
      .select({
        parentTaskId: tasks.parentTaskId,
        completed: countWhere(sql`${tasks.status} = ${TaskStatus.COMPLETED}`),
        total: count(),
      })
      .from(tasks)
      .where(
        and(
          inArray(
            tasks.parentTaskId,
            rows.map((row) => row.id),
          ),
          isNull(tasks.archivedAt),
          // cancelled subtasks are left out so they do not dilute progress, as in project stats.
          // A task whose subtasks are all cancelled gets no group, so its progress is null
          ne(tasks.status, TaskStatus.CANCELLED),
        ),
      )
      .groupBy(tasks.parentTaskId)
      .all()
      .map(({ parentTaskId, ...counts }) => [parentTaskId as TaskId, counts]),
  );
  const projects = projectSummaries(db, uniqueIds(rows.map((row) => row.projectId)));
  const events = eventSummaries(db, uniqueIds(rows.map((row) => row.linkedEventId)));
  const notes = noteSummaries(db, uniqueIds(rows.map((row) => row.linkedNoteId)));

  return withExternalRefs(db, rows).map((row) => {
    let link: TaskLinkSummary | null = null;
    const event = row.linkedEventId && events.get(row.linkedEventId);
    const note = row.linkedNoteId && notes.get(row.linkedNoteId);
    if (event) link = { type: 'event', ...event };
    else if (note) link = { type: 'note', ...note };
    return {
      ...row,
      subtaskProgress: progress.get(row.id) ?? null,
      project: (row.projectId && projects.get(row.projectId)) || null,
      link,
    };
  });
}
