import { describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
import type { TaskTreeItem } from '@common/types';
import {
  parentsIn,
  subtasksShown,
  visibleRows,
  withSubtrees,
} from '@renderer/features/tasks/lib/tree';

const row = (id: string, depth = 0, subtreeSize: number | null = null) =>
  ({ id: id as TaskId, title: id, depth, subtreeSize }) as TaskTreeItem;
const ids = (rows: TaskTreeItem[]) => rows.map((r) => r.id);

const TREE = [row('a'), row('a1', 1), row('a1x', 2), row('a2', 1), row('b'), row('big', 0, 80)];

describe('the task tree', () => {
  it('shows a parent with its subtasks at first, and a root sent alone hidden', () => {
    expect(subtasksShown(TREE[0], new Map())).toBe(true);
    expect(subtasksShown(TREE[5], new Map())).toBe(false);
    expect(subtasksShown(TREE[5], new Map([['big', true]]))).toBe(true);
  });

  it('finds the parents: rows with a deeper row under them, and roots sent alone', () => {
    expect([...parentsIn(TREE)].sort()).toEqual(['a', 'a1', 'big']);
  });

  it('leaves out the rows under a hidden parent, at any depth', () => {
    expect(ids(visibleRows(TREE, new Map()))).toEqual(['a', 'a1', 'a1x', 'a2', 'b', 'big']);
    expect(ids(visibleRows(TREE, new Map([['a', false]])))).toEqual(['a', 'b', 'big']);
    expect(ids(visibleRows(TREE, new Map([['a1', false]])))).toEqual(['a', 'a1', 'a2', 'b', 'big']);
  });

  it('places a loaded subtree under its root, hidden until the root is shown', () => {
    const rows = withSubtrees(TREE, new Map([['big', [row('big1', 1), row('big1x', 2)]]]));
    expect(ids(rows).slice(-3)).toEqual(['big', 'big1', 'big1x']);
    expect(ids(visibleRows(rows, new Map())).slice(-1)).toEqual(['big']);
    expect(ids(visibleRows(rows, new Map([['big', true]]))).slice(-3)).toEqual([
      'big',
      'big1',
      'big1x',
    ]);
  });
});
