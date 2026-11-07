import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { SPLASH_MINIMUM_MS, SplashGate } from '../../workspace/splash';

const work = { id: 'wsp_work' as WorkspaceId, name: 'Work' };

afterEach(() => vi.useRealTimers());

describe('SplashGate', () => {
  it('shows from begin, and hides once settled and shown for the minimum', () => {
    vi.useFakeTimers();
    const gate = new SplashGate();
    const listener = vi.fn();
    gate.subscribe(listener);
    gate.begin(work);
    expect(gate.getSnapshot()).toEqual({ visible: true, workspace: work });
    vi.advanceTimersByTime(100);
    gate.settle();
    expect(gate.getSnapshot().visible).toBe(true);
    vi.advanceTimersByTime(SPLASH_MINIMUM_MS - 101);
    expect(gate.getSnapshot().visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(gate.getSnapshot().visible).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('hides at once when settled after the minimum', () => {
    vi.useFakeTimers();
    const gate = new SplashGate();
    gate.begin(work);
    vi.advanceTimersByTime(SPLASH_MINIMUM_MS + 1);
    gate.settle();
    expect(gate.getSnapshot().visible).toBe(false);
  });

  it('stays up for a second switch begun while it hides, counting from when it first showed', () => {
    vi.useFakeTimers();
    const gate = new SplashGate();
    gate.begin(work);
    gate.settle();
    vi.advanceTimersByTime(300);
    gate.begin({ id: 'wsp_home' as WorkspaceId, name: 'Home' });
    vi.advanceTimersByTime(SPLASH_MINIMUM_MS);
    expect(gate.getSnapshot()).toMatchObject({ visible: true, workspace: { name: 'Home' } });
    gate.settle();
    expect(gate.getSnapshot().visible).toBe(false);
  });

  it('ignores settle while hidden', () => {
    const gate = new SplashGate();
    const listener = vi.fn();
    gate.subscribe(listener);
    gate.settle();
    expect(listener).not.toHaveBeenCalled();
  });
});
