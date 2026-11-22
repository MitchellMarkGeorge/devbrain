import { inArray, sql, SQL } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskId } from '@common/ids';
import type { Task } from '@common/types';
import { tasks } from '@main/db/schema/tasks';
import { compareTasks } from './filter';
import type { TaskSortOptions } from './types';

/*
 * The task list as a tree (docs/renderer/task-tree.md): how `TaskService.listTaskTree` and
 * `listSubtree` lay out the rows under their roots once the roots are chosen.
 *
 * A root is a task matching the list's filter whose parent is missing or doesn't match it
 * (`listTaskTree` picks a page of them). Its subtree is its matching descendants at any depth:
 * the walk goes down `parent_task_id` and stops at a row that doesn't match, so a matching task
 * under one that doesn't is not in the subtree; it is a root of its own. Every matching task is
 * therefore in exactly one place: a root, or under the one root above it.
 *
 * Parents are taken to form a tree. DevBrain never makes a cycle ("Make subtask of…" refuses one),
 * and the providers it syncs don't allow one. A cycle in the data would have no root, so its tasks
 * would be left out of the list (the walks below still end: they don't loop). How to show one,
 * should a provider ever send them, is in docs/renderer/task-tree.md ("Cycles of parents").
 *
 * Everything here is synchronous, as better-sqlite3 is, and reads only: one recursive walk for
 * the ids, one read of the rows by id, and the ordering in memory.
 */

/**
 * The most matching subtasks a root brings inline in a page of the task tree. A root with more
 * comes alone, its rows loaded when the user expands it (`listSubtree`), so no page grows past
 * `limit × (1 + INLINE_SUBTREE_LIMIT)` rows however a workspace's tasks nest. A subtree of exactly
 * this many still comes inline. The count is of every depth, not only the root's own subtasks.
 */
export const INLINE_SUBTREE_LIMIT = 50;

/**
 * A task placed in the tree, before the list's details are added (`withListDetails`).
 *
 * - `depth`: 0 for a root, 1 for its subtask, 2 for a subtask of that, and so on.
 * - `subtreeSize`: on a root whose subtree is too big to come inline, how many matching
 *   subtasks it has (more than `INLINE_SUBTREE_LIMIT`); null on every other row, including a root
 *   whose subtasks follow it and one with none.
 */
export type TreeRow = Task & { depth: number; subtreeSize: number | null };

/**
 * The SQL of a recursive walk down the subtrees of `rootIds`: a `with recursive sub(root, id)`
 * clause, to be followed by a `select … from sub`. Each row of `sub` is one matching descendant
 * (`id`), at any depth, with the root it is under (`root`); the roots themselves are not in it.
 *
 * - **Matching.** Both steps keep only rows meeting `match` (the list's filter, `taskFilter`), so
 *   the walk stops at a row that doesn't match: neither it nor anything under it is in `sub`.
 * - **Cycles.** `union` (not `union all`) drops a (root, id) pair already found, so a parent cycle
 *   in the data ends the walk instead of looping.
 * - **Roots** go in as one JSON array read with `json_each`, as in `subtreeOfAll`: one parameter
 *   whatever their number, so the statement has the same shape for a page of one root or 100.
 * - **The parent index is named** (`indexed by`) in both steps. Without statistics (DevBrain
 *   never runs `ANALYZE`), SQLite weighs `project_id IS NULL` in a "No project" filter as an
 *   equality as selective as `parent_task_id = sub.id`, and picks the project index: every step
 *   then reads every task without a project, 450 ms for seed:large's parent of 1,000 subtasks
 *   where the parent index takes 4 ms. The walk only ever goes down by parent, so naming the index
 *   says what it wants; a migration that renames or drops the index makes this query fail at once
 *   rather than slow down.
 */
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

/**
 * The matching descendants of each of `rootIds`, at any depth, as (root, id) pairs in no order:
 * ids only, so walking even a subtree of thousands builds no rows. A root with no matching
 * descendants has no pair; `rootIds` empty reads nothing. See `descendants` for the walk.
 */
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

/**
 * The task rows with these ids, in no order, read through the primary key. The ids go in as one
 * JSON array (`json_each`), so the statement has one shape however many there are; an id with no
 * row is skipped. It reads rows whatever their state: the ids come from a walk that already
 * applied the filter.
 */
function rowsById(db: BetterSQLite3Database, ids: readonly TaskId[]): Task[] {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(tasks)
    .where(inArray(tasks.id, sql`(select value from json_each(${JSON.stringify(ids)}))`))
    .all() as Task[];
}

/**
 * Lays `roots` out with their descendants (`rows`) in tree order: each root, then each of its
 * subtasks followed by that subtask's own, and so on down, with `depth` counted from the root (0).
 *
 * - **Roots keep their order:** they come in `sort`'s order from the page's query.
 * - **Siblings** (the subtasks of one parent) are put in `sort`'s order here (`compareTasks`, the
 *   same order `taskPager` reads the list in), so a parent's subtasks read as the list does.
 * - **Rows whose parent is not placed are dropped:** `rows` should hold only descendants of the
 *   roots, which the walk guarantees.
 * - **Each task is placed once,** so a parent cycle in `rows` ends rather than repeats.
 *
 * Runs in memory over the rows given, in time linear in their number (plus sorting siblings).
 */
function inTreeOrder(
  roots: readonly Task[],
  rows: readonly Task[],
  sort: TaskSortOptions,
): { task: Task; depth: number }[] {
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
 * A page of the task tree from its roots: each root followed by its matching descendants in tree
 * order (`inTreeOrder`), for `listTaskTree` to add the list's details to.
 *
 * - `roots`: the page's roots, already chosen and in `sort`'s order (the cursor is theirs).
 * - `match`: the list's filter as SQL on the tasks table (`taskFilter(tasks, filter)`), the same
 *   the roots were chosen by, so a subtree holds exactly the descendants that would be listed.
 * - `sort`: the list's sort, which orders each set of siblings as it orders the roots.
 *
 * A root with at most `INLINE_SUBTREE_LIMIT` matching descendants is followed by all of them, with
 * `subtreeSize` null. One with more comes alone with `subtreeSize` set to their number, and
 * `subtreeRows` reads them when the user expands it. A root with none comes alone with
 * `subtreeSize` null. Descendants always have `subtreeSize` null.
 *
 * Two statements whatever the page holds: one walk for the sizes and for the ids of the subtrees
 * that come inline (a big subtree costs only its ids here), and one read of those rows.
 */
export function expandRoots(
  db: BetterSQLite3Database,
  roots: readonly Task[],
  match: SQL,
  sort: TaskSortOptions,
): TreeRow[] {
  const pairs = descendantIds(
    db,
    roots.map((root) => root.id),
    match,
  );
  // each root's number of matching descendants; a root with none has no entry
  const sizes = new Map<TaskId, number>();
  for (const { root } of pairs) sizes.set(root, (sizes.get(root) ?? 0) + 1);
  // the descendants of the roots small enough to come inline: the only rows read
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

/**
 * One root's matching descendants, for `listSubtree`: the rows `expandRoots` would have placed
 * under it had its subtree been small enough, in the same tree order. The root itself is not
 * included, so depths start at 1 (its own subtasks), as they would under it in the page.
 *
 * - `root`: the task whose subtree to read, as `listSubtree` read it by id. It isn't checked
 *   against `match`: the page already listed it as a root.
 * - `match` and `sort`: the list's filter and sort, as `expandRoots` takes them, so the rows
 *   agree with the page's.
 *
 * Reads every matching descendant with no limit: the user asked for this one subtree.
 */
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
