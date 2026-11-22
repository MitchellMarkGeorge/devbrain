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
 * Whether each row is the last of its siblings (the subtasks of the same parent): the rows the
 * prefix ends with └ rather than ├. A row is the last of its siblings when no later row sits at
 * its depth before the rows go shallower (its parent's subtasks have ended).
 *
 * It reads the rows from the bottom up, because "is a sibling still to come?" is about the rows
 * below: by the time a row comes up, every row below it has been seen. For the rows a, a1, a1x, a2
 * (depths 0, 1, 2, 1):
 *
 *   a2   depth 1: nothing seen at depth 1 yet   → last; now a row at depth 1 is below
 *   a1x  depth 2: nothing seen at depth 2 yet   → last; now a row at depth 2 is below
 *   a1   depth 1: a2 is below, at depth 1       → not last; forget depth 2 (a1x was a1's own)
 *   a    depth 0: nothing seen at depth 0 yet   → last
 */
function markLastSiblings(rowDepths: readonly number[]): boolean[] {
  const isLastSibling: boolean[] = new Array(rowDepths.length);
  // for each depth: whether a row at that depth has been seen below, under the same parent as the
  // rows being read now
  const siblingSeenBelow: boolean[] = [];

  for (let row = rowDepths.length - 1; row >= 0; row--) {
    const depth = rowDepths[row];
    isLastSibling[row] = !siblingSeenBelow[depth];
    // the deeper rows seen so far were this row's own subtasks (or a later sibling's): they are
    // no siblings of the rows above, so forget them
    siblingSeenBelow.length = depth;
    // and for the rows above, a row at this depth is now below them
    siblingSeenBelow[depth] = true;
  }
  return isLastSibling;
}

/**
 * Each row's place in the tree, from rows in tree order with their depths, as core's `tasks.tree`
 * gives them (each subtask after its parent and the parent's earlier subtasks). A row with no
 * `depth` is at the left.
 *
 * A row's prefix has one cell per level, as the `tree` command prints one:
 *
 *   a                  []
 *   ├ a1               [tee]
 *   │ └ a1x            [line, elbow]
 *   └ a2               [elbow]
 *     └ a2x            [none, elbow]
 *
 * Its own cell (the last) is └ when it is the last of its siblings, else ├. Each cell before it is
 * for one of its ancestors: │ when that ancestor has a later sibling (its parent's line runs on
 * past this row, down to that sibling), else nothing. So a row's cells come from whether it and
 * each of its ancestors is the last of its siblings, which `markLastSiblings` works out first.
 */
export function treeOf(tasks: readonly Pick<TaskRowData, 'depth'>[]): TaskRowTree[] {
  const rowDepths = tasks.map((task) => task.depth ?? 0);
  const isLastSibling = markLastSiblings(rowDepths);

  // Read from the top down, the row's ancestors are the latest rows above at each shallower depth.
  // For each depth: whether the current row's ancestor at that depth is the last of its siblings.
  const ancestorIsLastSibling: boolean[] = [];

  return rowDepths.map((depth, row) => {
    // the entries at this depth and deeper belonged to an earlier branch: drop them
    ancestorIsLastSibling.length = depth;

    const cells: TreeCell[] = [];
    // one cell for each ancestor below the root: │ while its parent has more subtasks to come
    for (let ancestorDepth = 1; ancestorDepth < depth; ancestorDepth++) {
      cells.push(ancestorIsLastSibling[ancestorDepth] ? 'none' : 'line');
    }
    // then the row's own: └ for the last of its siblings, ├ for any other (a root has none)
    if (depth > 0) cells.push(isLastSibling[row] ? 'elbow' : 'tee');

    // for the rows below, this row is their ancestor at its depth
    ancestorIsLastSibling[depth] = isLastSibling[row];

    // its subtasks follow it when the next row is one level deeper: a stem runs down to them
    const hasSubtasksBelow = rowDepths[row + 1] === depth + 1;
    return { depth, cells, open: hasSubtasksBelow };
  });
}
