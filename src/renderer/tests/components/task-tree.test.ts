// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { TaskId } from '@common/ids';
import { TaskStatus } from '@common/types';
import {
  PillHoverCardsProvider,
  type PillHoverCardsProviderProps,
  type PillTarget,
} from '@renderer/components/entities/EntityHoverCard';
import { TaskRow, treeOf } from '@renderer/components/lists/TaskRow';
import {
  sampleEventLink,
  sampleParent,
  sampleProject,
  sampleTask,
} from '@renderer/components/lists/TaskRow/fixtures';

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

  it('makes the subtask count the button that shows and hides the subtasks', () => {
    const parent = sampleTask({ title: 'Ship it', subtaskProgress: { completed: 1, total: 3 } });
    const changes: boolean[] = [];
    let opened = 0;
    const draw = (shown: boolean) =>
      act(() =>
        root.render(
          createElement(TaskRow, {
            task: parent,
            stack: 'none',
            subtasksShown: shown,
            onSubtasksShownChange: (next) => changes.push(next),
            onOpen: () => opened++,
          }),
        ),
      );
    draw(true);
    const toggle = () => container.querySelector<HTMLButtonElement>('[data-subtasks-toggle]')!;
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    act(() => toggle().click());
    draw(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    act(() => toggle().click());
    expect(changes).toEqual([false, true]);
    // a click on the count doesn't open the task
    expect(opened).toBe(0);
  });

  it('keeps the count a plain pill without a way to toggle', () => {
    const parent = sampleTask({ title: 'Ship it', subtaskProgress: { completed: 1, total: 3 } });
    act(() => root.render(createElement(TaskRow, { task: parent, stack: 'none' })));
    expect(container.querySelector('[data-subtasks-toggle]')).toBeNull();
  });

  it('opens no hover card on the count that toggles, and its card on a plain count', () => {
    const parent = sampleTask({ title: 'Ship it', subtaskProgress: { completed: 1, total: 3 } });
    const prepared: string[] = [];
    const draw = (toggles: boolean) =>
      act(() =>
        root.render(
          createElement(
            PillHoverCardsProvider,
            {
              delay: 0,
              closeDelay: 0,
              renderCard: () => null,
              children: null,
              onPrepare: (target: PillTarget) => {
                prepared.push(target.type);
              },
            } as PillHoverCardsProviderProps,
            createElement(TaskRow, {
              task: parent,
              stack: 'none',
              ...(toggles ? { subtasksShown: true, onSubtasksShownChange: () => {} } : {}),
            }),
          ),
        ),
      );
    // focusing a pill opens its card, as pointing at it does
    const focusCount = () =>
      act(() =>
        [...container.querySelectorAll('[data-slot="badge"]')]
          .find((el) => el.textContent?.includes('1/3'))!
          .dispatchEvent(new FocusEvent('focusin', { bubbles: true })),
      );

    draw(true);
    focusCount();
    expect(prepared).toEqual([]);
    draw(false);
    focusCount();
    expect(prepared).toEqual(['subtasks']);
  });

  it('leaves off the parent, link and project pills the list asks it to', () => {
    const busy = sampleTask({
      title: 'Busy',
      parentTask: sampleParent('The parent'),
      link: sampleEventLink('The meeting'),
      project: sampleProject('The project'),
    });
    const draw = (hide: boolean) =>
      act(() =>
        root.render(
          createElement(TaskRow, {
            task: busy,
            stack: 'none',
            showParent: !hide,
            showLink: !hide,
            showProject: !hide,
          }),
        ),
      );
    draw(false);
    for (const name of ['The parent', 'The meeting', 'The project']) {
      expect(container.textContent).toContain(name);
    }
    draw(true);
    for (const name of ['The parent', 'The meeting', 'The project']) {
      expect(container.textContent).not.toContain(name);
    }
  });

  it('takes a subtask with no parent field, as a task’s own Subtasks list gives it', () => {
    const { parentTask, ...own } = sampleTask({ title: 'Own subtask' });
    void parentTask;
    act(() => root.render(createElement(TaskRow, { task: own, stack: 'none' })));
    expect(container.textContent).toContain('Own subtask');
  });
});
