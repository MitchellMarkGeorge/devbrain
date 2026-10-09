// given a random date/time, return the days "range":
// start being the start of the day

import { TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { sql } from 'drizzle-orm';
import { Task } from './types';

export function isSubtask(task: Task) {
  return task.parentTaskId !== null;
}

/**
 * The ids of a task and every task below it, at any depth, archived or not, as a subquery
 * for `inArray`. `UNION` (not `UNION ALL`) stops the walk if the rows ever hold a cycle.
 */
export function subtreeIds(id: TaskId) {
  return sql`(WITH RECURSIVE subtree(id) AS (
    SELECT ${id}
    UNION
    SELECT ${tasks.id} FROM ${tasks} JOIN subtree ON ${tasks.parentTaskId} = subtree.id
  ) SELECT id FROM subtree)`;
}
