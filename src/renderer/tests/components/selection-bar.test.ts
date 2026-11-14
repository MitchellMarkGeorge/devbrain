// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelectionBar } from '@renderer/components/lists/SelectionBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The selection bar animates in and out with `open`: it mounts in its hidden style and leaves it a
// frame later, and on closing keeps its last count on screen while it fades, then unmounts.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const render = (open: boolean, count: number) =>
  act(() => root.render(createElement(SelectionBar, { open, count, floating: false })));
const bar = () => container.querySelector<HTMLElement>('[role="toolbar"]');

describe('SelectionBar', () => {
  it('draws nothing while closed', () => {
    render(false, 0);
    expect(bar()).toBeNull();
  });

  it('enters from its hidden style', () => {
    render(false, 0);
    render(true, 2);
    expect(bar()?.hasAttribute('data-starting-style')).toBe(true);
    act(() => vi.advanceTimersByTime(50));
    expect(bar()?.hasAttribute('data-starting-style')).toBe(false);
    expect(bar()?.textContent).toContain('2 selected');
  });

  it('leaves showing its last count, then unmounts', () => {
    render(true, 3);
    render(false, 0);
    expect(bar()?.hasAttribute('data-ending-style')).toBe(true);
    expect(bar()?.textContent).toContain('3 selected');
    // inert, not aria-hidden: it gives up focus as it leaves
    expect(bar()?.inert).toBe(true);
    expect(bar()?.hasAttribute('aria-hidden')).toBe(false);
    act(() => vi.advanceTimersByTime(250));
    expect(bar()).toBeNull();
  });

  it('comes back if reopened while leaving', () => {
    render(true, 1);
    render(false, 0);
    render(true, 2);
    expect(bar()?.hasAttribute('data-ending-style')).toBe(false);
    act(() => vi.advanceTimersByTime(250));
    expect(bar()?.textContent).toContain('2 selected');
  });
});
