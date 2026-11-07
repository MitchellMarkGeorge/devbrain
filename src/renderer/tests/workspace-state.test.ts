import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import type { IpcBridge } from '@common/ipc/types';
import type { WorkspaceInfo, WorkspaceSnapshot, WorkspaceState } from '@common/types';
import { createWorkspaceStateStore } from '../app/workspace-state';

// The store the window draws from: main's newest workspace state, the splash held at least its
// minimum, and whether the app keeps the page it is on.

const work = { id: 'wsp_work' as WorkspaceId, name: 'Work' } as WorkspaceInfo;
const home = { id: 'wsp_home' as WorkspaceId, name: 'Home' } as WorkspaceInfo;

const none: WorkspaceState = { status: 'none', error: null };
const opening = (workspace: WorkspaceInfo): WorkspaceState => ({ status: 'opening', workspace });
const open = (workspace: WorkspaceInfo): WorkspaceState => ({
  status: 'open',
  workspace,
  error: null,
});

// a bridge whose state the test sets, on a clock the test moves
function setup(first: WorkspaceSnapshot | null) {
  let listener: (snapshot: WorkspaceSnapshot) => void = () => {};
  const source: IpcBridge['workspaceState'] = {
    get: vi.fn(() => first),
    subscribe: vi.fn((next) => {
      listener = next;
      return () => {};
    }),
  };
  let clock = 1000;
  const timers: { at: number; run: () => void }[] = [];
  const store = createWorkspaceStateStore({
    source,
    holdMs: 600,
    now: () => clock,
    setTimer: (run, ms) => {
      const timer = { at: clock + ms, run };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => timers.splice(timers.indexOf(timer as never), 1),
  });
  const changed = vi.fn();
  store.subscribe(changed);
  return {
    store,
    source,
    changed,
    send: (version: number, state: WorkspaceState) => listener({ version, state }),
    // moves the clock on, running the timers due
    advance(ms: number) {
      clock += ms;
      for (const timer of [...timers].filter(({ at }) => at <= clock)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
    status: () => store.get()?.state.status,
  };
}

describe('the workspace state store', () => {
  it('reads the bridge once, then subscribes, and keeps its own copy', () => {
    const { store, source } = setup({ version: 1, state: none });
    expect(source.get).toHaveBeenCalledOnce();
    expect(source.subscribe).toHaveBeenCalledOnce();
    expect(store.get()).toBe(store.get());
    expect(store.get()).toEqual({ version: 1, state: none, keepPage: false });
  });

  it('is null until main says something', () => {
    const { store, send } = setup(null);
    expect(store.get()).toBeNull();
    send(1, none);
    expect(store.get()?.state).toEqual(none);
  });

  it('shows a state at once when the splash is not up', () => {
    const { send, status, changed } = setup({ version: 1, state: none });
    send(2, opening(work));
    expect(status()).toBe('opening');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('holds the splash until 600ms after the open began', () => {
    const { send, status, advance } = setup({ version: 1, state: none });
    send(2, opening(work));
    advance(100);
    send(3, open(work));
    expect(status()).toBe('opening');
    advance(499);
    expect(status()).toBe('opening');
    advance(1);
    expect(status()).toBe('open');
  });

  it('shows the end of a slow open at once', () => {
    const { send, status, advance } = setup({ version: 1, state: opening(work) });
    advance(700);
    send(2, open(work));
    expect(status()).toBe('open');
  });

  it('replaces a held state with a newer one', () => {
    const { store, send, advance } = setup({ version: 1, state: opening(work) });
    send(2, none);
    send(3, open(work));
    advance(600);
    expect(store.get()).toMatchObject({ version: 3, state: { status: 'open' } });
  });

  it('shows another opening at once, keeping the splash timed from the first', () => {
    const { store, send, status, advance } = setup({ version: 1, state: opening(work) });
    advance(300);
    send(2, opening(home));
    expect(store.get()?.state).toEqual(opening(home));
    send(3, open(home));
    advance(299);
    expect(status()).toBe('opening');
    advance(1);
    expect(status()).toBe('open');
  });

  it('drops older versions, held or shown', () => {
    const { store, send, advance } = setup({ version: 5, state: none });
    send(4, opening(work));
    expect(store.get()?.version).toBe(5);
    send(6, opening(work));
    send(7, open(work));
    send(6, none);
    advance(600);
    expect(store.get()?.version).toBe(7);
  });

  it('keeps the page on a reload into the open workspace, and when a failed switch comes back', () => {
    const { store, send, advance } = setup({ version: 1, state: open(work) });
    expect(store.get()?.keepPage).toBe(true);

    send(2, opening(home));
    send(3, open(work));
    advance(600);
    expect(store.get()).toMatchObject({ state: { workspace: work }, keepPage: true });
  });

  it('lands elsewhere for a new workspace, and after onboarding', () => {
    const { store, send, advance } = setup({ version: 1, state: open(work) });
    send(2, opening(home));
    send(3, open(home));
    advance(600);
    expect(store.get()?.keepPage).toBe(false);

    send(4, none);
    send(5, opening(home));
    send(6, open(home));
    advance(600);
    expect(store.get()).toMatchObject({ state: { workspace: home }, keepPage: false });
  });

  it('lands on the landing page when the page loads during the splash', () => {
    const { store, send, advance } = setup({ version: 1, state: opening(work) });
    send(2, open(work));
    advance(600);
    expect(store.get()?.keepPage).toBe(false);
  });

  it('stops following the bridge, and runs no held timer', () => {
    let unsubscribed = false;
    const timers: (() => void)[] = [];
    const store = createWorkspaceStateStore({
      source: {
        get: () => ({ version: 1, state: opening(work) }),
        subscribe: (listener) => {
          listener({ version: 2, state: none });
          return () => (unsubscribed = true);
        },
      },
      setTimer: (run) => timers.push(run),
      clearTimer: () => timers.splice(0),
    });
    store.stop();
    expect(unsubscribed).toBe(true);
    expect(timers).toEqual([]);
    expect(store.get()?.state.status).toBe('opening');
  });
});
