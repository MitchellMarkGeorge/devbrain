import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SubtaskListItem, Task, TaskListItem, TaskLinkSummary, TaskStatus } from './types';

// counts the rows matching `predicate`; count(<boolean>) would count every row
const countWhere = (predicate: SQL) =>
  sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

const unique = <T>(values: (T | null)[]): T[] => [
  ...new Set(values.filter((value): value is T => value !== null)),
];

/**
 * Adds what a task row in the task list shows beside its own fields: its subtask progress, its
 * parent, its project and its link. One query per kind for the whole page, never one per row.
 * Archived parents, subtasks, projects and notes are left out, as every list leaves them out.
 */
export function withListDetails(db: BetterSQLite3Database, rows: Task[]): TaskListItem[] {
  const parentIds = unique<TaskId>(rows.map((row) => row.parentTaskId));
  const parents = new Map(
    parentIds.length === 0
      ? []
      : db
          .select({ id: tasks.id, title: tasks.title, status: tasks.status })
          .from(tasks)
          .where(and(inArray(tasks.id, parentIds), isNull(tasks.archivedAt)))
          .all()
          .map((parent) => [parent.id, parent]),
  );

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
        // cancelled subtasks are left out so they do not dilute progress, as in project stats
        total: countWhere(sql`${tasks.status} != ${TaskStatus.CANCELLED}`),
      })
      .from(tasks)
      .where(
        and(
          inArray(
            tasks.parentTaskId,
            rows.map((row) => row.id),
          ),
          isNull(tasks.archivedAt),
        ),
      )
      .groupBy(tasks.parentTaskId)
      .all()
      .map(({ parentTaskId, ...counts }) => [parentTaskId as TaskId, counts]),
  );

  const projectIds = unique<ProjectId>(rows.map((row) => row.projectId));
  const projectsById = new Map(
    projectIds.length === 0
      ? []
      : db
          .select({ id: projects.id, title: projects.title, color: projects.color })
          .from(projects)
          .where(and(inArray(projects.id, projectIds), isNull(projects.archivedAt)))
          .all()
          .map((project) => [project.id, project]),
  );

  const noteIds = unique<NoteId>(rows.map((row) => row.linkedNoteId));
  const notesById = new Map(
    noteIds.length === 0
      ? []
      : db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(and(inArray(notes.id, noteIds), isNull(notes.archivedAt)))
          .all()
          .map((note) => [note.id, { type: 'note' as const, ...note }]),
  );

  const eventIds = unique<EventId>(rows.map((row) => row.linkedEventId));
  const eventsById = new Map(
    eventIds.length === 0
      ? []
      : db
          .select({
            id: events.id,
            title: events.title,
            startAt: events.startAt,
            // the event's own colour overrides its calendar's
            color: sql<string | null>`coalesce(${events.color}, ${calendars.color})`,
          })
          .from(events)
          .innerJoin(calendars, eq(events.calendarId, calendars.id))
          .where(inArray(events.id, eventIds))
          .all()
          .map((event) => [event.id, { type: 'event' as const, ...event }]),
  );

  return rows.map((row) => {
    let link: TaskLinkSummary | null = null;
    if (row.linkedEventId) link = eventsById.get(row.linkedEventId) ?? null;
    else if (row.linkedNoteId) link = notesById.get(row.linkedNoteId) ?? null;
    return {
      ...row,
      subtaskProgress: progress.get(row.id) ?? null,
      project: (row.projectId && projectsById.get(row.projectId)) || null,
      link,
    };
  });
}
