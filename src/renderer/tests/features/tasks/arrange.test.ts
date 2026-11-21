import { describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
import type { TaskListItem } from '@common/types';
import { arrangeSubtasks, placedParents } from '@renderer/features/tasks/lib/arrange';

const task = (id: string, parent: string | null = null) =>
  ({ id: id as TaskId, title: id, parentTaskId: parent as TaskId | null }) as TaskListItem;
const ids = (tasks: TaskListItem[]) => tasks.map((t) => t.id);

describe('arrangeSubtasks', () => {
  it('moves a subtask under its parent, keeping the sort among siblings', () => {
    const list = [task('sub2', 'a'), task('b'), task('a'), task('sub1', 'a'), task('c')];
    expect(ids(arrangeSubtasks(list))).toEqual(['b', 'a', 'sub2', 'sub1', 'c']);
  });

  it('leaves a subtask whose parent is not listed where the sort put it', () => {
    const list = [task('a'), task('orphan', 'zz'), task('b')];
    expect(ids(arrangeSubtasks(list))).toEqual(['a', 'orphan', 'b']);
  });

  it('nests deeper subtasks, and hides those of a collapsed parent', () => {
    const list = [task('a'), task('a1', 'a'), task('a1x', 'a1'), task('b')];
    expect(ids(arrangeSubtasks(list))).toEqual(['a', 'a1', 'a1x', 'b']);
    expect(ids(arrangeSubtasks(list, new Set(['a'])))).toEqual(['a', 'b']);
    expect(ids(arrangeSubtasks(list, new Set(['a1'])))).toEqual(['a', 'a1', 'b']);
  });
});

describe('placedParents', () => {
  it('names the parents with a subtask in the same list, not one in another group', () => {
    const parents = placedParents([
      [task('a'), task('a1', 'a'), task('b')],
      [task('b1', 'b'), task('c'), task('c1', 'c'), task('c1x', 'c1')],
    ]);
    expect([...parents].sort()).toEqual(['a', 'c', 'c1']);
  });
});
