// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  createMinuteClock,
  FormatProvider,
  useFormat,
  type FormatProviderProps,
  type Precision,
} from '../../components/lib/format';

// Monday 22 June 2026, 11:58:30 PM local time: a minute tick, then midnight, are close
const START = new Date(2026, 5, 22, 23, 58, 30);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe('createMinuteClock', () => {
  it('ticks at the start of each minute while something listens', () => {
    const clock = createMinuteClock();
    const listener = vi.fn();
    const stop = clock.subscribe(listener);
    expect(clock.now()).toBe(new Date(2026, 5, 22, 23, 58).getTime());

    vi.advanceTimersByTime(29_000);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clock.now()).toBe(new Date(2026, 5, 22, 23, 59).getTime());

    vi.advanceTimersByTime(60_000);
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(5 * 60_000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useFormat', () => {
  let root: Root;
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  // renders one reader at each precision, counting their renders and showing their `now`
  function mount() {
    const renders: Record<Precision, number> = { day: 0, minute: 0 };
    const seen: Record<Precision, number> = { day: 0, minute: 0 };
    function Reader({ precision }: { precision: Precision }) {
      const { now } = useFormat(precision);
      renders[precision] += 1;
      seen[precision] = now.getTime();
      return null;
    }
    act(() =>
      root.render(
        createElement(
          FormatProvider,
          null,
          createElement(Reader, { precision: 'day' }),
          createElement(Reader, { precision: 'minute' }),
        ),
      ),
    );
    return { renders, seen };
  }

  it("re-renders a 'minute' reader each minute, and a 'day' reader only at midnight", () => {
    const { renders, seen } = mount();
    expect(renders).toEqual({ day: 1, minute: 1 });
    expect(seen.day).toBe(new Date(2026, 5, 22).getTime());

    act(() => vi.advanceTimersByTime(30_000)); // 11:59 PM
    expect(renders).toEqual({ day: 1, minute: 2 });

    act(() => vi.advanceTimersByTime(60_000)); // midnight
    expect(renders).toEqual({ day: 2, minute: 3 });
    expect(seen.day).toBe(new Date(2026, 5, 23).getTime());
    expect(seen.minute).toBe(new Date(2026, 5, 23, 0, 0).getTime());
  });

  it('never ticks with a fixed now', () => {
    const renders = { count: 0 };
    function Reader() {
      useFormat('minute');
      renders.count += 1;
      return null;
    }
    act(() =>
      root.render(
        createElement(FormatProvider, { now: START } as FormatProviderProps, createElement(Reader)),
      ),
    );
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(renders.count).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
