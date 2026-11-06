import { TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { sql, SQL } from 'drizzle-orm';

/**
 * A subquery of the ids of a task and all of its descendants, at any depth, for use with
 * `inArray`. Local tasks nest one level, but synced and detached ones carry Linear's depth, so the
 * walk is a recursive CTE. `union` drops rows already seen, so a parent cycle cannot loop.
 *
 * Archived rows are included; callers filter on `archivedAt` where it matters.
 */
export function subtreeOf(id: TaskId): SQL {
  return sql`(with recursive subtree(id) as (select ${id} union select ${tasks.id} from ${tasks} join subtree on ${tasks.parentTaskId} = subtree.id) select id from subtree)`;
}

/**
 * `subtreeOf` for several tasks at once: the ids of each task in `ids` and all of their
 * descendants, in one recursive walk. The ids go in as one JSON parameter read with `json_each`,
 * so the query has the same shape however many there are; one `subtreeOf` per id joined with OR
 * would hit SQLite's expression depth limit (1000) at a few hundred.
 */
export function subtreeOfAll(ids: TaskId[]): SQL {
  return sql`(with recursive subtree(id) as (select value from json_each(${JSON.stringify(ids)}) union select ${tasks.id} from ${tasks} join subtree on ${tasks.parentTaskId} = subtree.id) select id from subtree)`;
}
