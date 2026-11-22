import { and, eq, gt, gte, isNull, lt, not, notInArray, SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { tasks } from '@main/db/schema/tasks';
import { LinkState, Task, TaskStatus } from '@common/types';
import { localDayWindow } from '../shared/dates';
import { hasLinkInState } from '../integrations/refs';
import { keyset, PageOptions } from '../shared/pagination';
import type { TaskFilterOptions, TaskSortOptions } from './types';

/**
 * The tasks table, or an alias of it (`alias(tasks, 'parent')`). Drizzle types an alias's columns
 * with the alias's name, so a caller passes one as this type; the columns render with the alias.
 */
export type TasksTable = typeof tasks;

/**
 * The conditions a task must meet to be listed under `filter`, on `table`: the tasks table itself,
 * or an alias of it, so a query can test a row's parent against the same filter as the row. Always
 * leaves out archived tasks.
 */
export function taskFilterClauses(table: TasksTable, filter: TaskFilterOptions): SQL[] {
  const clauses = [isNull(table.archivedAt)];
  if (filter.excludeSubtasks) clauses.push(isNull(table.parentTaskId));
  if (filter.excludeClosed) {
    clauses.push(notInArray(table.status, [TaskStatus.COMPLETED, TaskStatus.CANCELLED]));
  }

  if (filter.status) clauses.push(eq(table.status, filter.status));

  if (filter.projectId !== undefined) {
    clauses.push(
      filter.projectId === null ? isNull(table.projectId) : eq(table.projectId, filter.projectId),
    );
  }

  if (filter.noteId !== undefined) {
    clauses.push(
      filter.noteId === null ? isNull(table.linkedNoteId) : eq(table.linkedNoteId, filter.noteId),
    );
  }

  if (filter.eventId !== undefined) {
    clauses.push(
      filter.eventId === null
        ? isNull(table.linkedEventId)
        : eq(table.linkedEventId, filter.eventId),
    );
  }

  // NONE is 0, so test for a value, not truthiness
  if (filter.priority !== undefined) clauses.push(eq(table.priority, filter.priority));
  if (filter.dueBefore != null) clauses.push(lt(table.dueDate, filter.dueBefore));
  if (filter.dueAfter != null) clauses.push(gt(table.dueDate, filter.dueAfter));
  if (filter.noDueDate) clauses.push(isNull(table.dueDate));
  if (filter.dueOn != null) {
    // the local day the date falls on: from its start, inclusive, to the next midnight, exclusive
    const { startOfDay, endOfDay } = localDayWindow(filter.dueOn);
    clauses.push(gte(table.dueDate, startOfDay));
    clauses.push(lt(table.dueDate, endOfDay));
  }

  if (filter.origin !== undefined) {
    // only a synced link makes a task external; a detached one is the user's own again
    const synced = hasLinkInState('task', table.id, LinkState.SYNCED);
    clauses.push(filter.origin === 'external' ? synced : not(synced));
  }
  return clauses;
}

/** `taskFilterClauses` as one condition */
export function taskFilter(table: TasksTable, filter: TaskFilterOptions): SQL {
  return and(...taskFilterClauses(table, filter)) as SQL;
}

function sortColumnOf(sortBy: TaskSortOptions['sortBy']): SQLiteColumn {
  switch (sortBy) {
    case 'dueDate':
      return tasks.dueDate;
    case 'priority':
      return tasks.priority;
    case 'status':
      return tasks.status;
    case 'createdAt':
      return tasks.createdAt;
    case 'updatedAt':
      return tasks.updatedAt;
  }
}

/** The keyset pager for the task list in `sort`'s order: by its column, then by id. */
export function taskPager(sort: TaskSortOptions, page: PageOptions) {
  const sortColumn = sortColumnOf(sort.sortBy);
  return keyset<Task>(
    {
      sortKey: sort.sortBy,
      sortColumn,
      idColumn: tasks.id,
      direction: sort.direction === 'asc' ? 'asc' : 'desc',
      sortValue: (row) => row[sortColumn.name as keyof Task],
      id: (row) => row.id,
      // undated rows sort last
      isSortValueNullable: sort.sortBy === 'dueDate',
    },
    page,
  );
}

/**
 * Compares two tasks in the order `taskPager` reads them in: by the sort's field in its direction,
 * an undated task after every dated one whichever the direction, then by id in the same direction.
 */
export function compareTasks(sort: TaskSortOptions): (a: Task, b: Task) => number {
  const field = sortColumnOf(sort.sortBy).name as keyof Task;
  const sign = sort.direction === 'asc' ? 1 : -1;
  const valueOf = (task: Task): number | null => {
    const value = task[field] as Date | number | null;
    return value instanceof Date ? value.getTime() : value;
  };
  return (a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sign;
    }
    // ids are ASCII, so code unit order is SQLite's binary order
    return a.id === b.id ? 0 : (a.id < b.id ? -1 : 1) * sign;
  };
}
