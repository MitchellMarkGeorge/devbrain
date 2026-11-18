// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  PillHoverCardsProvider,
  type PillHoverCardsProviderProps,
  type PillTarget,
} from '@renderer/components/entities/EntityHoverCard';
import { TaskRow } from '@renderer/components/lists/TaskRow';
import {
  sampleEventLink,
  sampleProject,
  sampleTask,
} from '@renderer/components/lists/TaskRow/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stacked deck of pills spreads while pointed at and folds once left, but not while one of its
// pills' hover card is open: the pointer has gone on to the card, portalled outside the row, and
// the card stays by its pill. It folds once the card closes.

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

// the cards open and close at once; each shows its pill's name
const CARDS: Omit<PillHoverCardsProviderProps, 'children'> = {
  delay: 0,
  closeDelay: 0,
  renderCard: (target: PillTarget) => createElement('div', null, `Card of ${target.title}`),
};

function render() {
  act(() =>
    root.render(
      createElement(
        PillHoverCardsProvider,
        CARDS as PillHoverCardsProviderProps,
        createElement(TaskRow, { task: TASK, stack: 'right' }),
      ),
    ),
  );
}

const stack = () => container.querySelector<HTMLElement>('[data-side] [data-stack]')!;
const pill = (text: string) =>
  [...stack().querySelectorAll<HTMLElement>('button')].find((el) => el.textContent === text)!;

// the pointer moves from outside onto `element` (React's enter and leave come from over and out)
function enter(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body }),
    );
    element.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }),
    );
    element.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  });
}

// the pointer leaves `element` for `to`, outside the row
function leave(element: HTMLElement, to: HTMLElement) {
  act(() => {
    element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: to }));
    element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: to }));
    element.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, relatedTarget: to }));
    element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, relatedTarget: to }));
    to.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    to.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    to.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    to.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  });
}

async function eventually(assertion: () => void, timeout = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    }
  }
}

describe('a stacked deck of pills', () => {
  it('folds once the pointer leaves it', async () => {
    render();
    enter(pill('Platform'));
    expect(stack().hasAttribute('data-spread')).toBe(true);
    leave(pill('Platform'), document.body);
    await eventually(() => expect(stack().hasAttribute('data-spread')).toBe(false));
  });

  it('stays spread while a pill’s card is open, and folds once it closes', async () => {
    render();
    enter(pill('Platform'));
    await eventually(() => expect(document.body.textContent).toContain('Card of Platform'));
    // on to the card, which is outside the row
    const card = document.querySelector<HTMLElement>('[aria-label="Platform"]')!;
    leave(pill('Platform'), card);
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(stack().hasAttribute('data-spread')).toBe(true);
    expect(stack().hasAttribute('data-closing')).toBe(false);

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    await eventually(() => expect(pill('Platform').hasAttribute('data-popup-open')).toBe(false));
    await eventually(() => expect(stack().hasAttribute('data-spread')).toBe(false));
  });
});
