// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaskRow, type TaskRowProps } from '@renderer/components/lists/TaskRow';
import {
  sampleEventLink,
  sampleProject,
  sampleTask,
} from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stacked side keeps every pill whole (icon and label). Pointing at a pill marks the row spread
// (`data-spread`) until the pointer leaves the row; drawing it spread is CSS (TaskRow.module.css),
// which happy-dom does not draw, so the browser checks that.

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

const TASK = sampleTask({
  title: 'Move the sync engine onto change listeners',
  project: sampleProject('Platform', 'amber'),
  link: sampleEventLink('Architecture review', 'blue'),
});

function render(props: Partial<TaskRowProps> = {}) {
  act(() => root.render(createElement(TaskRow, { task: TASK, ...props })));
}

const rightStack = () => container.querySelector<HTMLElement>('[data-side] [data-stack]')!;

describe('a stack of pills', () => {
  it('keeps every pill’s label when stacked', () => {
    render({ stack: 'right' });
    expect(rightStack().hasAttribute('data-stacked')).toBe(true);
    expect(rightStack().textContent).toContain('Architecture review');
    expect(rightStack().textContent).toContain('Platform');
  });

  it('keeps its level while pointed at: the spread is drawn, not measured', () => {
    render({ stack: 'right' });
    act(() => {
      rightStack().dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      rightStack().dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    // spread, but still stacked: the level comes from full widths, not from the spread pills
    expect(container.querySelector('[role="row"]')!.hasAttribute('data-spread')).toBe(true);
    expect(rightStack().hasAttribute('data-stacked')).toBe(true);
  });

  it('spreads once a pill is pointed at, not the rest of the row, until the row is left', () => {
    render({ stack: 'right' });
    const row = container.querySelector<HTMLElement>('[role="row"]')!;
    const over = (element: Element) =>
      act(() => {
        element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      });

    over(container.querySelector('[data-name]')!);
    expect(row.hasAttribute('data-spread')).toBe(false);

    over(rightStack().firstElementChild!);
    expect(row.hasAttribute('data-spread')).toBe(true);
    // the pills move as they spread: back on the title, the row stays spread
    over(container.querySelector('[data-name]')!);
    expect(row.hasAttribute('data-spread')).toBe(true);

    act(() => {
      row.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    });
    expect(row.hasAttribute('data-spread')).toBe(false);
  });

  it('spreads while a pill has focus', () => {
    render({ stack: 'right' });
    const row = container.querySelector<HTMLElement>('[role="row"]')!;
    const pill = rightStack().querySelector<HTMLElement>('button')!;
    act(() => pill.focus());
    expect(row.hasAttribute('data-spread')).toBe(true);
    act(() => row.focus());
    expect(row.hasAttribute('data-spread')).toBe(false);
  });

  it('never stacks a side with one pill', () => {
    render({ stack: 'both', task: { ...TASK, link: null } });
    expect(rightStack().hasAttribute('data-stacked')).toBe(false);
  });

  // A stacked pill can shorten its label (to an ellipsis, or away to its icon). The row must
  // still count its full width, or it would measure narrow, unstack, measure wide and stack again,
  // without end ("Maximum update depth exceeded").
  it('settles on a level when its stacked pills are shortened', () => {
    const restore = fakeLayout();
    try {
      // both pills apart (306px) overflow; stacked (each capped at 140px, 276px) they fit
      render();
      expect(rightStack().hasAttribute('data-stacked')).toBe(true);
      render();
      expect(rightStack().hasAttribute('data-stacked')).toBe(true);
    } finally {
      restore();
    }
  });
});

/**
 * happy-dom lays nothing out, so this fakes a row's: 500px of room from the title to the row's end,
 * a 200px title, and pills 150px in full (50px of icon and padding, a 100px label) that drop their
 * label when stacked. Returns what puts the real one back.
 */
function fakeLayout(): () => void {
  const pillOf = (el: Element) => !!el.parentElement?.hasAttribute('data-stack');
  const labelOf = (el: Element) =>
    !!el.parentElement && pillOf(el.parentElement) && el === el.parentElement.lastElementChild;
  const stacked = (el: Element) => !!el.closest('[data-stacked]');
  const scrollWidth = (el: Element) => {
    if (el.hasAttribute('data-name')) return 200;
    if (pillOf(el)) return stacked(el) ? 50 : 150;
    if (labelOf(el)) return 100;
    return 0;
  };
  const clientWidth = (el: Element) => (labelOf(el) && stacked(el) ? 0 : scrollWidth(el));
  const rect = (el: Element) => {
    const left = el.hasAttribute('data-title') ? 100 : 0;
    const right = el.getAttribute('role') === 'row' ? 600 : 0;
    return { left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0 };
  };
  const fakes: Record<string, PropertyDescriptor> = {
    scrollWidth: {
      get(this: Element) {
        return scrollWidth(this);
      },
    },
    clientWidth: {
      get(this: Element) {
        return clientWidth(this);
      },
    },
    getBoundingClientRect: {
      value(this: Element) {
        return rect(this) as DOMRect;
      },
    },
  };
  const proto = Element.prototype;
  const saved = Object.keys(fakes).map(
    (name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const,
  );
  for (const [name, descriptor] of Object.entries(fakes)) {
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
  }
  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else delete (proto as unknown as Record<string, unknown>)[name];
    }
  };
}
