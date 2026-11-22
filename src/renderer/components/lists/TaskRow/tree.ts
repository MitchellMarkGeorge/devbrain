import type { TaskRowData } from './types';

/**
 * What a row draws at one level of the tree, as the `tree` command's prefix does:
 *
 * - `tee` (├): the row's own level, with a later sibling to come: the line goes on past it.
 * - `elbow` (└): the row's own level, and it is the last of its siblings.
 * - `line` (│): an ancestor's level, where that ancestor has a later sibling: its line passes by.
 * - `none`: an ancestor's level, where that ancestor was the last: nothing.
 */
export type TreeCell = 'tee' | 'elbow' | 'line' | 'none';

/**
 * Where a row sits among subtasks drawn under their parents (`TaskList`'s `nested`): how far it is
 * indented, and what it draws at each level to its left.
 */
export interface TaskRowTree {
  /** 0 for a row with no parent above it, 1 for a subtask under it, 2 for a subtask of that, … */
  depth: number;
  /**
   * one per level, from 1 to `depth`: each ancestor's below it (`line` or `none`), then the row's
   * own (`tee` or `elbow`). Empty at depth 0.
   */
  cells: TreeCell[];
  /** the row's own subtasks are drawn right below it: a stem runs down from its status icon */
  open: boolean;
}

/**
 * Each row's place in the tree, from rows in tree order with their depths, as core's `tasks.tree`
 * gives them (each subtask after its parent and the parent's earlier subtasks). A row with no
 * `depth` is at the left. Linear: two passes over the depths.
 *
 * 1. From the bottom up: whether each row is the last of its siblings, that is whether no later row
 *    sits at its depth before the rows go shallower. `later[d]` says a row at depth `d` has been
 *    seen below, under the same parent; meeting a shallower row forgets the deeper ones.
 * 2. From the top down: each row's cells, from whether each of its ancestors (the latest row above
 *    at each shallower depth) was last, then whether it is.
 */
export function treeOf(tasks: readonly Pick<TaskRowData, 'depth'>[]): TaskRowTree[] {
  const depths = tasks.map((task) => task.depth ?? 0);

  const last: boolean[] = new Array(depths.length);
  const later: boolean[] = [];
  for (let i = depths.length - 1; i >= 0; i--) {
    const depth = depths[i];
    last[i] = !later[depth];
    later.length = depth;
    later[depth] = true;
  }

  // whether the row's ancestor at each depth (the latest row above at that depth) was last
  const ancestorWasLast: boolean[] = [];
  return depths.map((depth, i) => {
    ancestorWasLast.length = depth;
    const cells: TreeCell[] = [];
    for (let level = 1; level < depth; level++) {
      cells.push(ancestorWasLast[level] ? 'none' : 'line');
    }
    if (depth > 0) cells.push(last[i] ? 'elbow' : 'tee');
    ancestorWasLast[depth] = last[i];
    return { depth, cells, open: depths[i + 1] === depth + 1 };
  });
}
