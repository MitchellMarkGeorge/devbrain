// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUndoable, UndoStack } from '@renderer/keyboard/undo';
import { keymap, press, setUp } from './helpers';

describe('UndoStack', () => {
  it('undoes the newest entry first', async () => {
    const stack = new UndoStack();
    const undone: string[] = [];
    stack.push({ label: 'a', undo: () => void undone.push('a') });
    stack.push({ label: 'b', undo: () => void undone.push('b') });
    expect(stack.peek()?.label).toBe('b');

    expect((await stack.undo())?.label).toBe('b');
    expect((await stack.undo())?.label).toBe('a');
    expect(await stack.undo()).toBeUndefined();
    expect(undone).toEqual(['b', 'a']);
  });

  it('keeps the last `limit` entries', () => {
    const stack = new UndoStack(2);
    for (const label of ['a', 'b', 'c']) stack.push({ label, undo: () => {} });
    expect(stack.list().map((e) => e.label)).toEqual(['b', 'c']);
  });

  it('takes an entry off before its undo runs, so a failure is not retried', async () => {
    const stack = new UndoStack();
    stack.push({
      label: 'a',
      undo: () => {
        throw new Error('gone');
      },
    });
    await expect(stack.undo()).rejects.toThrow('gone');
    expect(stack.size).toBe(0);
  });

  it('waits for an async undo, and tells subscribers', async () => {
    const stack = new UndoStack();
    const listener = vi.fn();
    stack.subscribe(listener);
    let restored = false;
    stack.push({
      label: 'a',
      undo: async () => {
        await Promise.resolve();
        restored = true;
      },
    });
    await stack.undo();
    expect(restored).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('takes back one entry wherever it is (a toast’s Undo), once', async () => {
    const stack = new UndoStack();
    const undone: string[] = [];
    const a = { label: 'a', undo: () => void undone.push('a') };
    stack.push(a);
    stack.push({ label: 'b', undo: () => void undone.push('b') });
    expect((await stack.take(a))?.label).toBe('a');
    expect(await stack.take(a)).toBeUndefined();
    expect(undone).toEqual(['a']);
    expect(stack.list().map((e) => e.label)).toEqual(['b']);
  });
});

describe('isUndoable', () => {
  it('tells an Undoable from other results', () => {
    expect(isUndoable({ label: 'x', undo: () => {} })).toBe(true);
    expect(isUndoable(undefined)).toBe(false);
    expect(isUndoable({ label: 'x' })).toBe(false);
  });
});

describe('undoable commands', () => {
  let detach: () => void = () => {};
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => detach());

  it('push what they return onto the stack, sync or async', async () => {
    const ctx = setUp(
      keymap([
        { scope: 'global', keys: 'mod+backspace', command: 'row.trash' },
        { scope: 'global', keys: 'a', command: 'row.archive' },
        { scope: 'global', keys: 'u', command: 'undo' },
      ]),
    );
    detach = ctx.detach;
    const restored: string[] = [];
    ctx.registry.register([
      {
        id: 'row.trash',
        title: 'Move to trash',
        scope: 'global',
        run: () => ({ label: 'Moved to trash', undo: () => void restored.push('trash') }),
      },
      {
        id: 'row.archive',
        title: 'Archive',
        scope: 'global',
        run: async () => ({ label: 'Archived', undo: () => void restored.push('archive') }),
      },
      {
        id: 'undo',
        title: 'Undo',
        scope: 'global',
        run: (c) => void c.undoStack.undo(),
        enabled: (c) => c.undoStack.size > 0,
      },
    ]);

    press(document.body, 'Backspace', { meta: true });
    expect(ctx.undoStack.peek()?.label).toBe('Moved to trash');
    press(document.body, 'a');
    await vi.waitFor(() => expect(ctx.undoStack.size).toBe(2));

    press(document.body, 'u');
    await vi.waitFor(() => expect(restored).toEqual(['archive']));
    press(document.body, 'u');
    await vi.waitFor(() => expect(restored).toEqual(['archive', 'trash']));
    // nothing left: the binding is disabled and the key goes through
    expect(press(document.body, 'u').defaultPrevented).toBe(false);
  });

  it('report an async failure without pushing', async () => {
    const ctx = setUp(keymap([{ scope: 'global', keys: 'a', command: 'fail' }]));
    detach = ctx.detach;
    ctx.registry.register([
      { id: 'fail', title: 'Fail', scope: 'global', run: () => Promise.reject(new Error('no')) },
    ]);
    press(document.body, 'a');
    await vi.waitFor(() => expect(ctx.errors).toHaveLength(1));
    expect(ctx.undoStack.size).toBe(0);
  });
});
