import type { TaskRowData } from './types';

/**
 * Where a row sits among subtasks drawn under their parents (`TaskList`'s `nested`): how far it is
 * indented, and which of the guide lines joining it to its parents run on below it.
 */
export interface TaskRowTree {
  /** 0 for a row with no parent above it, 1 for a subtask under it, 2 for a subtask of that, … */
  depth: number;
  /**
   * For each level from 1 to `depth`: whether the guide at that level runs on below this row, to
   * a later subtask of the same parent (at `depth`) or of an ancestor (above it)
   */
  continues: boolean[];
  /** the row's own subtasks are drawn right below it: a guide runs down from its status icon */
  open: boolean;
}

// whether a row after `index` sits at `level` before the rows drop below it
function runsOn(depths: readonly number[], index: number, level: number): boolean {
  for (let next = index + 1; next < depths.length; next++) {
    if (depths[next] < level) return false;
    if (depths[next] === level) return true;
  }
  return false;
}

/**
 * Each row's place in the tree, from rows already in tree order (each subtask after its parent and
 * the parent's earlier subtasks, as the tasks pages arrange them). A row is nested when its parent
 * is the row above it or one of that row's ancestors; any other row, a subtask whose parent is not
 * there included, is at depth 0 and keeps its parent's pill to say where it belongs.
 */
export function treeOf(tasks: readonly Pick<TaskRowData, 'id' | 'parentTask'>[]): TaskRowTree[] {
  const depths: number[] = [];
  // the ids of the row above and its ancestors, outermost first
  const path: string[] = [];
  for (const task of tasks) {
    const parent = task.parentTask?.id as string | undefined;
    path.length = parent ? path.lastIndexOf(parent) + 1 : 0;
    depths.push(path.length);
    path.push(task.id as string);
  }
  return depths.map((depth, index) => ({
    depth,
    continues: Array.from({ length: depth }, (_, level) => runsOn(depths, index, level + 1)),
    open: depths[index + 1] === depth + 1,
  }));
}
