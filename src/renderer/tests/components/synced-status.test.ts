import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LinkState, TaskStatus } from '@common/types';
import { LinkedTaskRow } from '@renderer/components/lists/LinkedTaskRow';
import { TaskRow } from '@renderer/components/lists/TaskRow';
import { sampleLinear, sampleTask } from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A synced task's status is its provider's: its row's status icon is not a button and opens no
// menu, even when the list asks for it (`S`). A detached task is a local copy and keeps its menu.

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

const synced = sampleLinear('ENG-1');
const detached = { ...sampleLinear('ENG-2'), state: LinkState.DETACHED };
const statusButton = () => container.querySelector('button[aria-label^="Status:"]');

describe('TaskRow', () => {
  const render = (external: typeof synced | null, menuOpen = false) =>
    act(() =>
      root.render(
        createElement(TaskRow, {
          task: sampleTask({ title: 'A task', status: TaskStatus.IN_PROGRESS, external }),
          menuOpen,
          onStatusChange: () => {},
        }),
      ),
    );

  it('gives a local task a status button', () => {
    render(null);
    expect(statusButton()).not.toBeNull();
  });

  it('gives a synced task its icon alone, and no menu when asked for one', () => {
    render(synced, true);
    expect(statusButton()).toBeNull();
    expect(container.querySelector('[data-readonly]')).not.toBeNull();
    expect(container.querySelector('[data-menu-open]')).toBeNull();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('gives a detached task its status button back', () => {
    render(detached);
    expect(statusButton()).not.toBeNull();
  });
});

describe('LinkedTaskRow', () => {
  const render = (external: typeof synced | null) =>
    act(() =>
      root.render(
        createElement(LinkedTaskRow, {
          task: { title: 'A task', status: TaskStatus.NOT_STARTED, dueDate: null, external },
          onStatusChange: () => {},
        }),
      ),
    );

  it('gives a local task a status button', () => {
    render(null);
    expect(statusButton()).not.toBeNull();
  });

  it('gives a synced task its icon alone', () => {
    render(synced);
    expect(statusButton()).toBeNull();
    expect(container.querySelector('[data-readonly]')).not.toBeNull();
  });

  it('gives a detached task its status button back', () => {
    render(detached);
    expect(statusButton()).not.toBeNull();
  });
});
