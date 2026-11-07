import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import type { AppEvents } from '@common/events';
import type { WorkspaceInfo, WorkspaceSnapshot, WorkspaceState } from '@common/types';
import { createWorkspaceStateStore } from '../app/workspace-state';
import type { EventClient } from '../ipc/events';

// The store the window draws from: main's newest workspace state by version, across the initial
// snapshot, workspace.changed and workspaces.state; the splash held at least its minimum; and
// whether the app keeps the page it is on.

const work = { id: 'wsp_work' as WorkspaceId, name: 'Work' } as WorkspaceInfo;
const home = { id: 'wsp_home' as WorkspaceId, name: 'Home' } as WorkspaceInfo;

const none: WorkspaceState = { status: 'none', error: null };
const opening = (workspace: WorkspaceInfo): WorkspaceState => ({ status: 'opening', workspace });
const open = (workspace: WorkspaceInfo): WorkspaceState => ({
  status: 'open',
  workspace,
  error: null,
});

// main's side as the test drives it: the initial snapshot, workspace.changed, and the answer to
// workspaces.state, on a clock the test moves
function setup(first: WorkspaceSnapshot | null, options: { fetch?: boolean } = {}) {
  let listener: (snapshot: WorkspaceSnapshot) => void = () => {};
  const events: EventClient<AppEvents> = {
    on: vi.fn((name, next) => {
      expect(name).toBe('workspace.changed');
      listener = next as (snapshot: WorkspaceSnapshot) => void;
      return () => {};
    }) as EventClient<AppEvents>['on'],
  };
  let answer: (snapshot: WorkspaceSnapshot) => void = () => {};
  const fetch = vi.fn(() => new Promise<WorkspaceSnapshot>((resolve) => (answer = resolve)));
  let clock = 1000;
  const timers: { at: number; run: () => void }[] = [];
  const store = createWorkspaceStateStore({
    initial: first,
    events,
    fetch: options.fetch === false ? undefined : fetch,
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
    events,
    fetch,
    changed,
    send: (version: number, state: WorkspaceState) => listener({ version, state }),
    // main answers workspaces.state; resolves once the store has taken it
    answer: async (version: number, state: WorkspaceState) => {
      answer({ version, state });
      await Promise.resolve();
      await Promise.resolve();
    },
    // moves the clock on, running the timers due
    advance(ms: number) {
      clock += ms;
      for (const timer of [...timers].filter(({ at }) => at <= clock)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
    status: () => store.get().state.status,
  };
}

describe('the workspace state store', () => {
  it('starts from the initial snapshot, listens, then asks main once', () => {
    const { store, events, fetch } = setup({ version: 1, state: none });
    expect(events.on).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(events.on).mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[0],
    );
    expect(store.get()).toBe(store.get());
    expect(store.get()).toEqual({ version: 1, state: none, keepPage: false });
  });

  it('starts with no workspace without an initial snapshot', () => {
    const { store } = setup(null);
    expect(store.get()).toEqual({ version: 0, state: none, keepPage: false });
  });

  it('asks main nothing when told not to (DevBrain unavailable)', () => {
    const { fetch } = setup({ version: 1, state: none }, { fetch: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("takes main's answer when it is newer: a change sent before the store listened", async () => {
    const { store, answer, advance } = setup({ version: 1, state: opening(work) });
    await answer(2, open(work));
    advance(600);
    expect(store.get()).toMatchObject({ version: 2, state: { status: 'open' } });
  });

  it("drops main's answer when an event already brought something newer", async () => {
    const { store, send, answer } = setup({ version: 1, state: none });
    send(3, opening(home));
    await answer(2, opening(work));
    expect(store.get()).toMatchObject({ version: 3, state: opening(home) });
  });

  it("drops main's answer when it is the initial snapshot again", async () => {
    const { answer, changed } = setup({ version: 1, state: none });
    await answer(1, none);
    expect(changed).not.toHaveBeenCalled();
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
    expect(store.get().state).toEqual(opening(home));
    send(3, open(home));
    advance(299);
    expect(status()).toBe('opening');
    advance(1);
    expect(status()).toBe('open');
  });

  it('drops older versions, held or shown', () => {
    const { store, send, advance } = setup({ version: 5, state: none });
    send(4, opening(work));
    expect(store.get().version).toBe(5);
    send(6, opening(work));
    send(7, open(work));
    send(6, none);
    advance(600);
    expect(store.get().version).toBe(7);
  });

  it('keeps the page on a reload into the open workspace, and when a failed switch comes back', () => {
    const { store, send, advance } = setup({ version: 1, state: open(work) });
    expect(store.get().keepPage).toBe(true);

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
    expect(store.get().keepPage).toBe(false);

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
    expect(store.get().keepPage).toBe(false);
  });

  it('stops following main, and runs no held timer and no late answer', async () => {
    let unsubscribed = false;
    const timers: (() => void)[] = [];
    let answer: (snapshot: WorkspaceSnapshot) => void = () => {};
    const store = createWorkspaceStateStore({
      initial: { version: 1, state: opening(work) },
      events: {
        on: (_name, listener) => {
          (listener as (snapshot: WorkspaceSnapshot) => void)({ version: 2, state: none });
          return () => (unsubscribed = true);
        },
      },
      fetch: () => new Promise((resolve) => (answer = resolve)),
      setTimer: (run) => timers.push(run),
      clearTimer: () => timers.splice(0),
    });
    store.stop();
    answer({ version: 3, state: open(work) });
    await Promise.resolve();
    expect(unsubscribed).toBe(true);
    expect(timers).toEqual([]);
    expect(store.get().state.status).toBe('opening');
  });
});
