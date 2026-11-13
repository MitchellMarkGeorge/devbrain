// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormatProvider } from '../../components/lib/format';
import { TaskList, type TaskListHandle } from '../../components/lists/TaskList';
import { manyTasks } from '../../components/lists/TaskRow/fixtures';
import type { TaskRowData } from '../../components/lists/TaskRow';

// TaskList's focus for the keys: it follows the focused row when that row goes (moved to
// trash), to the row that takes its place, and a Visual range selects from its first row to the
// focused one.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const handle = createRef<TaskListHandle>();
let selected: string[] = [];
function render(tasks: TaskRowData[]) {
  act(() =>
    root.render(
      createElement(
        FormatProvider,
        null,
        createElement(TaskList, {
          ref: handle,
          tasks,
          onSelectedChange: (ids: string[]) => (selected = ids),
        }),
      ),
    ),
  );
}

describe('TaskList focus', () => {
  // happy-dom lays nothing out, so the list draws no rows after the first render: this checks the
  // list's focused row; the app run checks the DOM focus following it
  it('makes the row that takes a gone row’s place the focused one, not the first', () => {
    const tasks = manyTasks(5);
    render(tasks);
    act(() => handle.current!.moveFocus(2));
    expect(handle.current!.focusedItem()?.id).toBe(tasks[2].id);
    render(tasks.filter((_, i) => i !== 2));
    expect(handle.current!.focusedItem()?.id).toBe(tasks[3].id);
    render(tasks.slice(0, 2));
    expect(handle.current!.focusedItem()?.id).toBe(tasks[1].id);
  });

  it('leaves focus alone once it has gone elsewhere', () => {
    const tasks = manyTasks(3);
    render(tasks);
    act(() => handle.current!.moveFocus(1));
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => outside.focus());
    render(tasks.filter((_, i) => i !== 1));
    expect(document.activeElement).toBe(outside);
  });

  it('selects a range from where it started to the focused row', () => {
    const tasks = manyTasks(6);
    render(tasks);
    act(() => handle.current!.moveFocus(1));
    act(() => handle.current!.startRange());
    act(() => handle.current!.moveFocus(2));
    expect(selected).toEqual([tasks[1].id, tasks[2].id, tasks[3].id]);
    act(() => handle.current!.moveFocus(-3));
    expect(selected).toEqual([tasks[0].id, tasks[1].id]);
    act(() => handle.current!.endRange());
    act(() => handle.current!.moveFocus(4));
    expect(selected).toEqual([tasks[0].id, tasks[1].id]);
    expect(handle.current!.itemsFromFocus(2).map((t) => t.id)).toEqual([tasks[4].id, tasks[5].id]);
  });
});
