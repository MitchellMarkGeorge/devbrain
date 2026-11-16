import { ProjectId } from '@common/ids';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, inArray, isNull, SQL, sql } from 'drizzle-orm';
import { type Project, type ProjectListItem, type ProjectStats, TaskStatus } from '@common/types';
import { tasks } from '@main/db/schema/tasks';
import { localDayWindow } from '../shared/dates';
import { withExternalRefs } from '../integrations/refs';

/** A project with no active tasks: every count 0. */
export function emptyStats(): ProjectStats {
  return {
    numOfCompleted: 0,
    numOfInProgress: 0,
    numOfNotStarted: 0,
    numOfCancelled: 0,
    numOfOverdue: 0,
    totalTasks: 0,
  };
}

/**
 * Adds what a project row in the projects list shows beside its own fields: its provider ref
 * (`external`) and its task counts (`stats`). One query per kind for the whole page.
 */
export function withProjectListDetails(
  db: BetterSQLite3Database,
  rows: Omit<Project, 'external'>[],
): ProjectListItem[] {
  const stats = projectStatsOf(
    db,
    rows.map((project) => project.id),
  );
  return withExternalRefs(db, rows).map((project) => ({
    ...project,
    stats: stats.get(project.id) ?? emptyStats(),
  }));
}

/**
 * Each project's counts of its active tasks, in one grouped query (served by the project_id
 * index). A project with no active tasks is missing from the map: its counts are all 0.
 */
export function projectStatsOf(
  db: BetterSQLite3Database,
  ids: ProjectId[],
): Map<ProjectId, ProjectStats> {
  if (ids.length === 0) return new Map();
  // overdue is due before today, as the task rows and the tasks list's Overdue filter count it:
  // a task due today is not overdue yet
  const today = localDayWindow(new Date()).startOfDay.getTime();

  const count = (predicate: SQL) =>
    sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

  const rows = db
    .select({
      projectId: tasks.projectId,
      numOfCompleted: count(sql`${tasks.status} = ${TaskStatus.COMPLETED}`),
      numOfNotStarted: count(sql`${tasks.status} = ${TaskStatus.NOT_STARTED}`),
      numOfInProgress: count(sql`${tasks.status} = ${TaskStatus.IN_PROGRESS}`),
      numOfCancelled: count(sql`${tasks.status} = ${TaskStatus.CANCELLED}`),
      numOfOverdue: count(
        // an undated task is never overdue, and neither is a closed one
        sql`${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${today} AND ${tasks.status} NOT IN (${TaskStatus.COMPLETED}, ${TaskStatus.CANCELLED})`,
      ),
      // cancelled tasks are left out so they do not dilute progress
      totalTasks: count(sql`${tasks.status} != ${TaskStatus.CANCELLED}`),
    })
    .from(tasks)
    .where(and(inArray(tasks.projectId, ids), isNull(tasks.archivedAt)))
    .groupBy(tasks.projectId)
    .all();

  return new Map(rows.map(({ projectId, ...stats }) => [projectId as ProjectId, stats]));
}
