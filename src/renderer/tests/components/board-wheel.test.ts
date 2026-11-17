// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Board } from '../../components/board/BoardColumn';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// While the board scrolls sideways, a mostly-vertical wheel scrolls the column under the pointer:
// a mouse's wheel on macOS carries a little sideways movement, which would otherwise hand the
// gesture to the board's sideways scroller.

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

const size = (el: Element, sizes: Record<string, number>) => {
  for (const [key, value] of Object.entries(sizes))
    Object.defineProperty(el, key, { configurable: true, value });
};

// a board whose viewport is `overflowing` sideways, holding one column that scrolls 500px
function renderBoard(overflowing: boolean) {
  act(() =>
    root.render(
      createElement(
        Board,
        null,
        createElement(
          'div',
          { 'data-testid': 'column', style: { overflowY: 'auto' } },
          createElement('div', { 'data-testid': 'card' }),
        ),
      ),
    ),
  );
  const column = container.querySelector<HTMLElement>('[data-testid="column"]')!;
  const viewport = container.querySelector('[data-testid="column"]')!.parentElement!.parentElement!;
  size(viewport, { scrollWidth: overflowing ? 900 : 600, clientWidth: 600 });
  size(column, { scrollHeight: 1000, clientHeight: 500 });
  return { column, card: container.querySelector('[data-testid="card"]')! };
}

const wheel = (target: Element, init: WheelEventInit) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  // happy-dom's WheelEvent leaves out the modifier keys it is given
  Object.defineProperty(event, 'shiftKey', { value: init.shiftKey ?? false });
  target.dispatchEvent(event);
  return event;
};

describe('Board wheel', () => {
  it('scrolls the column under the pointer while the board scrolls sideways', () => {
    const { column, card } = renderBoard(true);
    const event = wheel(card, { deltaY: 120, deltaX: 4 });
    expect(event.defaultPrevented).toBe(true);
    expect(column.scrollTop).toBe(120);
  });

  it('leaves Shift+wheel and sideways swipes to the board', () => {
    const { column, card } = renderBoard(true);
    expect(wheel(card, { deltaY: 120, shiftKey: true }).defaultPrevented).toBe(false);
    expect(wheel(card, { deltaY: 10, deltaX: 40 }).defaultPrevented).toBe(false);
    expect(column.scrollTop).toBe(0);
  });

  it('leaves the wheel alone while the board fits', () => {
    const { column, card } = renderBoard(false);
    expect(wheel(card, { deltaY: 120 }).defaultPrevented).toBe(false);
    expect(column.scrollTop).toBe(0);
  });
});
