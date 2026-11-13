// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaskList, type TaskListHandle } from '../../components/lists/TaskList';
import { manyTasks } from '../../components/lists/TaskRow/fixtures';
import type { TaskRowData } from '../../components/lists/TaskRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// TaskList's roving focus (docs/design-system/README.md § Lists): the list is one tab stop, its
// handle moves focus by id, and when the focused row's task leaves the list the row now in its
// place takes focus, so the list's keys keep working.

// happy-dom lays nothing out: every element measures as a 1024×768 window, so the virtualizer
// draws the rows in view (as the routing harness does)
const WINDOW = { x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768, right: 1024, bottom: 768 };
for (const prototype of [Element.prototype, HTMLElement.prototype]) {
  prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { ...WINDOW, toJSON: () => WINDOW } as DOMRect;
  };
}
for (const [name, value] of [
  ['offsetWidth', WINDOW.width],
  ['offsetHeight', WINDOW.height],
  ['clientWidth', WINDOW.width],
  ['clientHeight', WINDOW.height],
] as const) {
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
}

let container: HTMLDivElement;
let root: Root;
const list = createRef<TaskListHandle>();

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (tasks: TaskRowData[]) =>
  act(() => root.render(createElement(TaskList, { ref: list, tasks, 'aria-label': 'Tasks' })));
const rows = () => [...container.querySelectorAll<HTMLElement>('[role="row"][data-task-id]')];
const focusedTask = () =>
  document.activeElement?.closest('[data-task-id]')?.getAttribute('data-task-id');

describe('TaskList focus', () => {
  it('is one tab stop: the first row until another is focused', () => {
    render(manyTasks(5));
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    act(() => list.current!.moveFocus(2));
    expect(focusedTask()).toBe('tsk_many_2');
    expect(rows().filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(rows()[2].tabIndex).toBe(0);
  });

  it('keeps every control inside a row out of the tab order', () => {
    render(manyTasks(5));
    const tabbable = container.querySelectorAll(
      '[role="row"][data-task-id] :is(button, [role="checkbox"], a, [tabindex]):not([tabindex="-1"])',
    );
    expect([...tabbable]).toEqual([]);
  });

  it('stops at the ends and moves to the first and last rows', () => {
    render(manyTasks(5));
    act(() => list.current!.moveFocus(-1));
    expect(focusedTask()).toBe('tsk_many_0');
    act(() => list.current!.focusLast());
    expect(focusedTask()).toBe('tsk_many_4');
    act(() => list.current!.moveFocus(3));
    expect(focusedTask()).toBe('tsk_many_4');
    act(() => list.current!.focusFirst());
    expect(focusedTask()).toBe('tsk_many_0');
  });

  it('gives the row count and each row its index', () => {
    render(manyTasks(5));
    const grid = container.querySelector('[role="grid"]')!;
    expect(grid.getAttribute('aria-rowcount')).toBe('5');
    expect(rows().map((row) => row.getAttribute('aria-rowindex'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    // a row's parts sit in its one gridcell
    expect(rows().every((row) => row.firstElementChild?.getAttribute('role') === 'gridcell')).toBe(
      true,
    );
  });

  it('focuses the next row when the focused one leaves the list', () => {
    const tasks = manyTasks(5);
    render(tasks);
    act(() => list.current!.moveFocus(2));
    expect(focusedTask()).toBe('tsk_many_2');
    render(tasks.filter((task) => task.id !== 'tsk_many_2'));
    expect(focusedTask()).toBe('tsk_many_3');
    expect(list.current!.focusedItem()?.id).toBe('tsk_many_3');
  });

  it('focuses the one before when the last row leaves', () => {
    const tasks = manyTasks(3);
    render(tasks);
    act(() => list.current!.focusLast());
    render(tasks.slice(0, 2));
    expect(focusedTask()).toBe('tsk_many_1');
  });

  it('leaves focus that went elsewhere where it is', () => {
    const tasks = manyTasks(3);
    render(tasks);
    act(() => list.current!.moveFocus(1));
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    render(tasks.filter((task) => task.id !== 'tsk_many_1'));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
