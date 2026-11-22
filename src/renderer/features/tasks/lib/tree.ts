import type { TaskTreeItem } from '@common/types';

/**
 * The tasks pages' list and group views read the task list as core's tree (`tasks.tree`): each
 * root, then its subtasks in tree order, each row with its `depth`. A root with more subtasks than
 * core sends inline comes alone with `subtreeSize`, and its rows come from `tasks.subtree` once it
 * is expanded. These put the two together and leave out what a hidden parent hides.
 */

/**
 * Whether a row's subtasks are shown: what the user chose, or by default shown for a root whose
 * subtasks came with it and hidden for one sent alone, whose subtasks load when it is expanded.
 */
export function subtasksShown(row: TaskTreeItem, chosen: ReadonlyMap<string, boolean>): boolean {
  return chosen.get(row.id) ?? row.subtreeSize === null;
}

/** The rows with each loaded subtree placed right after its root (`subtrees`, by root id). */
export function withSubtrees(
  rows: readonly TaskTreeItem[],
  subtrees: ReadonlyMap<string, readonly TaskTreeItem[]>,
): TaskTreeItem[] {
  if (subtrees.size === 0) return rows as TaskTreeItem[];
  return rows.flatMap((row) => {
    const subtree = row.subtreeSize !== null ? subtrees.get(row.id) : undefined;
    return subtree ? [row, ...subtree] : [row];
  });
}

/** The rows with subtasks to show or hide: those followed by a deeper row, and roots sent alone. */
export function parentsIn(rows: readonly TaskTreeItem[]): Set<string> {
  const parents = new Set<string>();
  rows.forEach((row, i) => {
    if (row.subtreeSize !== null || (rows[i + 1]?.depth ?? -1) > row.depth) parents.add(row.id);
  });
  return parents;
}

/** The rows a reader sees: every row but those under a parent whose subtasks are hidden. */
export function visibleRows(
  rows: readonly TaskTreeItem[],
  chosen: ReadonlyMap<string, boolean>,
): TaskTreeItem[] {
  const out: TaskTreeItem[] = [];
  // the depth of the hidden parent whose rows are being skipped
  let hiddenBelow: number | null = null;
  for (const row of rows) {
    if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
    hiddenBelow = null;
    out.push(row);
    if (!subtasksShown(row, chosen)) hiddenBelow = row.depth;
  }
  return out;
}
