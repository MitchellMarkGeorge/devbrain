import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ScrollArea } from '@renderer/components/ui/ScrollArea';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The scroll area's viewport takes focus while it overflows. Focused by a click, it is marked so
// it draws no ring when a key is pressed next; focused from the keyboard (Tab), it rings.

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
  vi.restoreAllMocks();
});

function viewport(onFocus = () => {}) {
  act(() =>
    root.render(createElement(ScrollArea, { viewportProps: { tabIndex: 0, onFocus } }, 'Content')),
  );
  return container.querySelector<HTMLElement>('[tabindex="0"]')!;
}

// what the browser says of the focus just taken: a click's never matches :focus-visible
function focusFrom(source: 'pointer' | 'keyboard') {
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ':focus-visible' ? source === 'keyboard' : matches.call(this, selector);
  });
}

describe('the scroll area’s focus', () => {
  it('marks a focus taken from a click until the viewport loses it', () => {
    const onFocus = vi.fn();
    const scroll = viewport(onFocus);
    focusFrom('pointer');
    act(() => scroll.focus());
    expect(scroll.dataset.pointerFocus).toBe('');
    expect(onFocus).toHaveBeenCalledOnce();
    act(() => scroll.blur());
    expect(scroll.dataset.pointerFocus).toBeUndefined();
  });

  it('leaves a focus from the keyboard unmarked, so it rings', () => {
    const scroll = viewport();
    focusFrom('keyboard');
    act(() => scroll.focus());
    expect(scroll.dataset.pointerFocus).toBeUndefined();
  });
});

// The children go in one content element inside the scrolling one: Base UI watches its size, so
// the scrollbar follows what is in the area, and it carries the content's layout.
describe('the scroll area’s content', () => {
  it('holds the children in a content element with the content’s class', () => {
    act(() =>
      root.render(
        createElement(
          ScrollArea,
          { viewportProps: { tabIndex: 0 }, contentClassName: 'layout' },
          createElement('div', { id: 'child' }),
        ),
      ),
    );
    const scroll = container.querySelector<HTMLElement>('[tabindex="0"]')!;
    const content = container.querySelector<HTMLElement>('#child')!.parentElement!;
    expect(content.parentElement).toBe(scroll);
    expect(scroll.children).toHaveLength(1);
    expect(content.classList.contains('layout')).toBe(true);
    // scrolled down, it keeps to the area's width, so a long line is cut, not scrolled
    expect(content.style.minWidth).toMatch(/^0(px)?$/);
  });

  it('is as wide as its children when it scrolls sideways', () => {
    act(() =>
      root.render(
        createElement(
          ScrollArea,
          { orientation: 'horizontal' },
          createElement('div', { id: 'child' }),
        ),
      ),
    );
    const content = container.querySelector<HTMLElement>('#child')!.parentElement!;
    expect(content.dataset.orientation).toBe('horizontal');
    expect(content.style.minWidth).toBe('fit-content');
  });
});
