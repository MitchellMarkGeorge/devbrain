import { inArray, sql, SQL } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskId } from '@common/ids';
import type { Task } from '@common/types';
import { tasks } from '@main/db/schema/tasks';
import { compareTasks } from './filter';
import type { TaskSortOptions } from './types';

/**
 * The most matching subtasks a root brings inline in a page of the task tree. A root with more
 * comes alone, its subtree loaded when it is expanded (`listSubtree`), so no page grows past
 * `limit × (1 + INLINE_SUBTREE_LIMIT)` rows however a workspace's tasks nest.
 */
export const INLINE_SUBTREE_LIMIT = 50;

/** A task placed in the tree: how deep it sits under its root, and the size of a deferred subtree. */
export type TreeRow = Task & { depth: number; subtreeSize: number | null };

// The matching descendants of each root in `rootIds`, at any depth, as (root, id) rows: a walk
// down `parent_task_id` that keeps only rows meeting `match`, so a descendant whose parent was left
// out is left out too (it is a root of its own). `union` drops rows already seen, so a parent cycle
// cannot loop. The roots go in as one JSON parameter, as in `subtreeOfAll`.
//
// Both steps read the parent index by name: with a filter on another indexed column (no project),
// SQLite would otherwise read that column's index at every step of the walk, scanning every task
// in the filter for each one it visits (450 ms for seed:large's parent of 1,000).
function descendants(rootIds: readonly TaskId[], match: SQL): SQL {
  const byParent = sql`${tasks} indexed by idx_tasks_parent_task_id`;
  return sql`with recursive sub(root, id) as (
    select ${tasks.parentTaskId}, ${tasks.id} from ${byParent}
      where ${tasks.parentTaskId} in (select value from json_each(${JSON.stringify(rootIds)}))
      and ${match}
    union
    select sub.root, ${tasks.id} from sub join ${byParent} on ${tasks.parentTaskId} = sub.id
      where ${match}
  )`;
}

/** The matching descendants of the roots, at any depth, as (root, id) pairs: ids only, no rows. */
function descendantIds(
  db: BetterSQLite3Database,
  rootIds: readonly TaskId[],
  match: SQL,
): { root: TaskId; id: TaskId }[] {
  if (rootIds.length === 0) return [];
  return db.all<{ root: TaskId; id: TaskId }>(
    sql`${descendants(rootIds, match)} select root, id from sub`,
  );
}

/** The rows with these ids, in no order. */
function rowsById(db: BetterSQLite3Database, ids: readonly TaskId[]): Task[] {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(tasks)
    .where(inArray(tasks.id, sql`(select value from json_each(${JSON.stringify(ids)}))`))
    .all() as Task[];
}

// Each root followed by its descendants in tree order: a parent before its subtasks, and the
// subtasks of one parent in `sort`'s order.
function inTreeOrder(roots: readonly Task[], rows: readonly Task[], sort: TaskSortOptions) {
  const compare = compareTasks(sort);
  const childrenOf = new Map<string, Task[]>();
  for (const row of rows) {
    if (!row.parentTaskId) continue;
    const siblings = childrenOf.get(row.parentTaskId) ?? [];
    siblings.push(row);
    childrenOf.set(row.parentTaskId, siblings);
  }
  for (const siblings of childrenOf.values()) siblings.sort(compare);

  const out: { task: Task; depth: number }[] = [];
  const seen = new Set<string>();
  const place = (task: Task, depth: number) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    out.push({ task, depth });
    for (const child of childrenOf.get(task.id) ?? []) place(child, depth + 1);
  };
  for (const root of roots) place(root, 0);
  return out;
}

/**
 * A page's roots with their subtrees: each root followed by its matching descendants in tree order,
 * siblings in `sort`'s order. A root with more than `INLINE_SUBTREE_LIMIT` of them comes alone,
 * with `subtreeSize` saying how many; every other row's `subtreeSize` is null.
 */
export function expandRoots(
  db: BetterSQLite3Database,
  roots: readonly Task[],
  match: SQL,
  sort: TaskSortOptions,
): TreeRow[] {
  // one walk down the subtrees, for their sizes and the ids of those that come inline
  const pairs = descendantIds(
    db,
    roots.map((root) => root.id),
    match,
  );
  const sizes = new Map<TaskId, number>();
  for (const { root } of pairs) sizes.set(root, (sizes.get(root) ?? 0) + 1);
  const inline = pairs.filter(({ root }) => sizes.get(root)! <= INLINE_SUBTREE_LIMIT);
  const placed = inTreeOrder(
    roots,
    rowsById(
      db,
      inline.map(({ id }) => id),
    ),
    sort,
  );
  return placed.map(({ task, depth }) => {
    const size = depth === 0 ? (sizes.get(task.id) ?? 0) : 0;
    return { ...task, depth, subtreeSize: size > INLINE_SUBTREE_LIMIT ? size : null };
  });
}

/** One root's matching descendants in tree order, with depths counted from the root's subtasks (1). */
export function subtreeRows(
  db: BetterSQLite3Database,
  root: Task,
  match: SQL,
  sort: TaskSortOptions,
): TreeRow[] {
  const ids = descendantIds(db, [root.id], match).map(({ id }) => id);
  return inTreeOrder([root], rowsById(db, ids), sort)
    .slice(1)
    .map(({ task, depth }) => ({ ...task, depth, subtreeSize: null }));
}
