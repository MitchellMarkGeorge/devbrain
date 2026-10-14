import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { DevBrain } from '@main/core';
import { closeBeforeQuit, forwardSyncTriggers, triggerSync } from '../../runtime/lifecycle';

// Electron's app and powerMonitor, as plain emitters: the lifecycle only listens and quits.

function quietLogger() {
  return { warn: vi.fn() };
}

// a DevBrain whose open workspace, if any, records the triggers its scheduler gets
function fakeDevBrain() {
  const workspace = (name: string) => ({
    name,
    sync: { trigger: vi.fn<(reason: string) => Promise<void>>(async () => undefined) },
  });
  const brain = { currentWorkspace: null as ReturnType<typeof workspace> | null, workspace };
  return brain;
}

const asDevBrain = (brain: ReturnType<typeof fakeDevBrain>) =>
  brain as unknown as Pick<DevBrain, 'currentWorkspace'>;

class FakeApp extends EventEmitter {
  quit = vi.fn(() => {
    const event = { preventDefault: vi.fn() };
    this.emit('before-quit', event);
    if (!event.preventDefault.mock.calls.length) this.quitted = true;
  });
  quitted = false;

  // what a quit from the user does: before-quit, then the quit unless it was prevented
  requestQuit(): { preventDefault: ReturnType<typeof vi.fn> } {
    const event = { preventDefault: vi.fn() };
    this.emit('before-quit', event);
    if (!event.preventDefault.mock.calls.length) this.quitted = true;
    return event;
  }
}

describe('Lifecycle — sync triggers', () => {
  it('does nothing before DevBrain has started or while no workspace is open', () => {
    const logger = quietLogger();
    expect(() => triggerSync(null, 'focus', logger)).not.toThrow();
    const brain = fakeDevBrain();
    expect(() => triggerSync(asDevBrain(brain), 'resume', logger)).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('forwards window focus and system resume to the open workspace', () => {
    const app = new EventEmitter();
    const powerMonitor = new EventEmitter();
    const brain = fakeDevBrain();
    forwardSyncTriggers({ app, powerMonitor }, () => asDevBrain(brain), quietLogger());

    // no workspace yet: nothing to sync
    app.emit('browser-window-focus');
    const first = brain.workspace('first');
    brain.currentWorkspace = first;
    app.emit('browser-window-focus');
    powerMonitor.emit('resume');
    expect(first.sync.trigger.mock.calls).toEqual([['focus'], ['resume']]);

    // after a switch, only the workspace open now is asked
    const second = brain.workspace('second');
    brain.currentWorkspace = second;
    app.emit('browser-window-focus');
    expect(first.sync.trigger).toHaveBeenCalledTimes(2);
    expect(second.sync.trigger.mock.calls).toEqual([['focus']]);
  });

  it('logs a trigger that fails, by its error class only', async () => {
    const logger = quietLogger();
    const brain = fakeDevBrain();
    const workspace = brain.workspace('first');
    workspace.sync.trigger.mockRejectedValueOnce(new TypeError('secret detail'));
    brain.currentWorkspace = workspace;

    triggerSync(asDevBrain(brain), 'focus', logger);
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce());
    expect(logger.warn.mock.calls[0][0]).toBe('Sync trigger threw reason=focus error=TypeError');
  });
});

describe('Lifecycle — quitting', () => {
  it('holds the quit until DevBrain has closed, then quits', async () => {
    const app = new FakeApp();
    let finishClose!: () => void;
    const close = vi.fn(() => new Promise<void>((resolve) => (finishClose = resolve)));
    closeBeforeQuit(app, close, quietLogger());

    const event = app.requestQuit();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(app.quitted).toBe(false);

    // quitting again while closing waits on the same close
    expect(app.requestQuit().preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();

    finishClose();
    await vi.waitFor(() => expect(app.quitted).toBe(true));
    expect(app.quit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('still quits when closing fails, and logs it', async () => {
    const app = new FakeApp();
    const logger = quietLogger();
    closeBeforeQuit(app, async () => Promise.reject(new RangeError('boom')), logger);

    app.requestQuit();
    await vi.waitFor(() => expect(app.quitted).toBe(true));
    expect(logger.warn).toHaveBeenCalledWith(
      'Closing DevBrain before quitting threw error=RangeError',
    );
  });
});
