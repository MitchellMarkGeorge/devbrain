import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskStatus } from '../tasks/types';

// The few fields a list row shows of another entity it points at, as a pill: a task's or note's
// project, a task's parent, and what a task or note is linked to. Each lookup takes the ids of a
// whole page and makes one query, never one per row. Archived rows are left out, as every list
// leaves them out; events are never archived.

export interface ProjectSummary {
  id: ProjectId;
  title: string;
  color: string | null;
}

export interface EventSummary {
  id: EventId;
  title: string;
  startAt: Date;
  // the event's own colour, or else its calendar's
  color: string | null;
}

export interface NoteSummary {
  id: NoteId;
  title: string;
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  status: TaskStatus;
}

/** the distinct non-null ids in `values` */
export function uniqueIds<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== null))];
}

export function projectSummaries(
  db: BetterSQLite3Database,
  ids: ProjectId[],
): Map<ProjectId, ProjectSummary> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: projects.id, title: projects.title, color: projects.color })
    .from(projects)
    .where(and(inArray(projects.id, ids), isNull(projects.archivedAt)))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

export function eventSummaries(
  db: BetterSQLite3Database,
  ids: EventId[],
): Map<EventId, EventSummary> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      color: sql<string | null>`coalesce(${events.color}, ${calendars.color})`,
    })
    .from(events)
    .innerJoin(calendars, eq(events.calendarId, calendars.id))
    .where(inArray(events.id, ids))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

export function noteSummaries(db: BetterSQLite3Database, ids: NoteId[]): Map<NoteId, NoteSummary> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: notes.id, title: notes.title })
    .from(notes)
    .where(and(inArray(notes.id, ids), isNull(notes.archivedAt)))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}

export function taskSummaries(db: BetterSQLite3Database, ids: TaskId[]): Map<TaskId, TaskSummary> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(inArray(tasks.id, ids), isNull(tasks.archivedAt)))
    .all();
  return new Map(rows.map((row) => [row.id, row]));
}
