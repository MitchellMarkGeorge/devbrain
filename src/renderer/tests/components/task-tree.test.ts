// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TaskId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { TaskRow, treeOf } from '@renderer/components/lists/TaskRow';
import { sampleParent, sampleTask } from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// a row with the given id under the parent with the given id (none for a top-level row)
const row = (id: string, parent?: string) =>
  sampleTask({
    id: id as TaskId,
    title: id,
    parentTask: parent
      ? { id: parent as TaskId, title: parent, status: TaskStatus.NOT_STARTED }
      : null,
  });

describe('treeOf', () => {
  it('nests subtasks under their parent, a level per generation', () => {
    const trees = treeOf([
      row('a'),
      row('a1', 'a'),
      row('a2', 'a'),
      row('a2x', 'a2'),
      row('a3', 'a'),
      row('b'),
    ]);
    expect(trees.map((t) => t.depth)).toEqual([0, 1, 1, 2, 1, 0]);
    expect(trees.map((t) => t.open)).toEqual([true, false, true, false, false, false]);
  });

  it('runs a guide on past a row while a later sibling or an ancestor’s subtask follows', () => {
    const trees = treeOf([
      row('a'),
      row('a1', 'a'),
      row('a2', 'a'),
      row('a2x', 'a2'),
      row('a2y', 'a2'),
      row('a3', 'a'),
    ]);
    expect(trees.map((t) => t.continues)).toEqual([
      [],
      [true], // a2 follows
      [true], // a3 follows
      [true, true], // a3 follows at level 1, a2y at level 2
      [true, false], // the last of a2's
      [false], // the last of a's
    ]);
  });

  it('leaves a subtask whose parent is not above it at the left', () => {
    const trees = treeOf([row('a'), row('b'), row('a1', 'a'), row('c', 'missing')]);
    expect(trees.map((t) => t.depth)).toEqual([0, 0, 0, 0]);
    expect(trees.every((t) => !t.open)).toBe(true);
  });

  it('closes a branch once a row outside it comes', () => {
    const trees = treeOf([row('a'), row('a1', 'a'), row('a1x', 'a1'), row('a2', 'a')]);
    expect(trees.map((t) => t.depth)).toEqual([0, 1, 2, 1]);
    expect(trees[2].continues).toEqual([true, false]);
  });
});

describe('TaskRow in a tree', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const subtask = sampleTask({
    title: 'Mobile fallback',
    parentTask: sampleParent('Implement OAuth2 PKCE flow'),
  });

  it('leaves out the parent pill under its parent, where the guide points at it', () => {
    act(() =>
      root.render(
        createElement(TaskRow, {
          task: subtask,
          stack: 'none',
          tree: { depth: 1, continues: [false], open: false },
        }),
      ),
    );
    expect(container.textContent).not.toContain('Implement OAuth2 PKCE flow');
    expect(
      container.querySelector<HTMLElement>('[role="row"]')?.style.getPropertyValue('--depth'),
    ).toBe('1');
  });

  it('keeps the parent pill at depth 0, where its parent is not above it', () => {
    act(() =>
      root.render(
        createElement(TaskRow, {
          task: subtask,
          stack: 'none',
          tree: { depth: 0, continues: [], open: false },
        }),
      ),
    );
    expect(container.textContent).toContain('Implement OAuth2 PKCE flow');
  });
});
