import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaskPriority } from '@common/types';
import { TaskRow } from '@renderer/components/lists/TaskRow';
import { sampleLinear, sampleTask } from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Given `onPriorityChange`, a row's priority icon is the button that opens its PriorityMenu. A
// synced task's priority is its provider's, and a row without it draws the icon alone.

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

const task = sampleTask({ title: 'A task', priority: TaskPriority.HIGH });
const priorityButton = () => container.querySelector('button[aria-label^="Priority:"]');
const menu = () => document.querySelector('[role="menu"][aria-label="Priority"]');

describe('TaskRow priority', () => {
  it('is a button named for the priority, given onPriorityChange', () => {
    act(() => root.render(createElement(TaskRow, { task, onPriorityChange: () => {} })));
    expect(priorityButton()?.getAttribute('aria-label')).toBe('Priority: High');
  });

  it('is the icon alone without onPriorityChange, and for a synced task', () => {
    act(() => root.render(createElement(TaskRow, { task })));
    expect(priorityButton()).toBeNull();
    act(() =>
      root.render(
        createElement(TaskRow, {
          task: { ...task, external: sampleLinear('ENG-1') },
          onPriorityChange: () => {},
        }),
      ),
    );
    expect(priorityButton()).toBeNull();
  });

  it('opens its own menu, not the status menu, and a click on it does not open the task', () => {
    const onOpen = vi.fn();
    act(() => root.render(createElement(TaskRow, { task, onOpen, onPriorityChange: () => {} })));
    act(() => (priorityButton() as HTMLElement).click());
    expect(onOpen).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
    expect(document.querySelector('[role="menu"][aria-label="Status"]')).toBeNull();
  });

  it('sets the priority picked and shows it until the task changes', () => {
    const onPriorityChange = vi.fn();
    act(() =>
      root.render(
        createElement(TaskRow, { task, onPriorityChange, defaultPriorityMenuOpen: true }),
      ),
    );
    const low = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((item) =>
      item.textContent?.includes('Low'),
    );
    act(() => low!.click());
    expect(onPriorityChange).toHaveBeenCalledWith(TaskPriority.LOW);
    expect(priorityButton()?.getAttribute('aria-label')).toBe('Priority: Low');
  });
});
