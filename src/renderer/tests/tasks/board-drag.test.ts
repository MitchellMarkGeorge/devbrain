import { describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
import { TaskStatus, type TaskListItem } from '@common/types';
import { placeCards } from '../../pages/tasks/views/board/board-drag';

const task = (id: string, status: TaskStatus) =>
  ({ id: id as TaskId, title: id, status }) as TaskListItem;
const ids = (columns: { tasks: TaskListItem[] }[]) =>
  columns.map((column) => column.tasks.map((t) => t.id));

const { NOT_STARTED: TODO, IN_PROGRESS: DOING, COMPLETED: DONE } = TaskStatus;

describe('placeCards', () => {
  it('draws a card whose status changed at the top of its new column', () => {
    const columns = [
      { status: TODO, tasks: [task('a', TODO), task('b', DOING)] },
      { status: DOING, tasks: [task('c', DOING)] },
    ];
    expect(ids(placeCards(columns))).toEqual([['a'], ['b', 'c']]);
  });

  it('draws it once when its new column has loaded it already', () => {
    const columns = [
      { status: TODO, tasks: [task('b', DOING)] },
      { status: DOING, tasks: [task('c', DOING), task('b', DOING)] },
    ];
    expect(ids(placeCards(columns))).toEqual([[], ['c', 'b']]);
  });

  it('leaves a card where it is when its new status has no column', () => {
    const columns = [
      { status: TODO, tasks: [task('a', DONE)] },
      { status: DOING, tasks: [] },
    ];
    expect(ids(placeCards(columns))).toEqual([['a'], []]);
  });
});
