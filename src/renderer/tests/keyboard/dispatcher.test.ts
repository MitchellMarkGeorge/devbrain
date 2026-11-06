// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, keymap, press, recorder, scoped, setUp } from './helpers';

let detachAll: (() => void)[] = [];
function start(...args: Parameters<typeof setUp>) {
  const ctx = setUp(...args);
  detachAll.push(ctx.detach);
  return ctx;
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const detach of detachAll) detach();
  detachAll = [];
  vi.useRealTimers();
});

describe('single keys and chords', () => {
  it('runs a bound command and stops the key', () => {
    const { registry } = start(keymap([{ scope: 'global', keys: 'c', command: 'task.new' }]));
    const { command, calls } = recorder('task.new');
    registry.register([command]);

    const event = press(document.body, 'c');
    expect(calls).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets unbound keys through', () => {
    const { registry } = start(keymap([{ scope: 'global', keys: 'c', command: 'task.new' }]));
    registry.register([recorder('task.new').command]);
    expect(press(document.body, 'x').defaultPrevented).toBe(false);
  });

  it('ignores a binding whose command is not registered or not enabled', () => {
    const { registry } = start(keymap([{ scope: 'global', keys: 'c', command: 'task.new' }]));
    expect(press(document.body, 'c').defaultPrevented).toBe(false);

    const { command, calls } = recorder('task.new');
    registry.register([{ ...command, enabled: () => false }]);
    expect(press(document.body, 'c').defaultPrevented).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('passes the entry’s args', () => {
    const { registry } = start(
      keymap([
        { scope: 'global', keys: '2', command: 'task.setStatus', args: { status: 'doing' } },
      ]),
    );
    const { command, calls } = recorder('task.setStatus');
    registry.register([command]);
    press(document.body, '2');
    expect(calls).toEqual([{ status: 'doing' }]);
  });
});

describe('mod per platform', () => {
  const map = keymap([{ scope: 'global', keys: 'mod+k', command: 'search.open' }]);

  it('is ⌘ on macOS', () => {
    const { registry } = start(map, 'macos');
    const { command, calls } = recorder('search.open');
    registry.register([command]);
    press(document.body, 'k', { ctrl: true });
    expect(calls).toHaveLength(0);
    press(document.body, 'k', { meta: true });
    expect(calls).toHaveLength(1);
  });

  it.each(['windows', 'linux'] as const)('is Ctrl on %s', (platform) => {
    const { registry } = start(map, platform);
    const { command, calls } = recorder('search.open');
    registry.register([command]);
    press(document.body, 'k', { meta: true });
    expect(calls).toHaveLength(0);
    press(document.body, 'k', { ctrl: true });
    expect(calls).toHaveLength(1);
  });

  it('follows a platform change', () => {
    const { registry, dispatcher } = start(map, 'macos');
    const { command, calls } = recorder('search.open');
    registry.register([command]);
    dispatcher.setPlatform('windows');
    press(document.body, 'k', { ctrl: true });
    expect(calls).toHaveLength(1);
  });
});

describe('sequences', () => {
  const map = keymap([
    { scope: 'global', keys: 'g t', command: 'nav.tasks' },
    { scope: 'global', keys: 'g h', command: 'nav.home' },
    { scope: 'global', keys: 't', command: 'other' },
  ]);

  it('buffers the first stroke and runs on the second', () => {
    const { registry, dispatcher } = start(map);
    const tasks = recorder('nav.tasks');
    const home = recorder('nav.home');
    const other = recorder('other');
    registry.register([tasks.command, home.command, other.command]);

    expect(press(document.body, 'g').defaultPrevented).toBe(true);
    expect(dispatcher.getState().pending).toEqual(['g']);
    press(document.body, 't');
    expect(tasks.calls).toHaveLength(1);
    expect(other.calls).toHaveLength(0);
    expect(dispatcher.getState().pending).toEqual([]);

    press(document.body, 'g');
    press(document.body, 'h');
    expect(home.calls).toHaveLength(1);
  });

  it('drops a sequence that matches nothing, swallowing its last key', () => {
    const { registry, dispatcher } = start(map);
    const other = recorder('other');
    registry.register([recorder('nav.tasks').command, other.command]);
    press(document.body, 'g');
    expect(press(document.body, 'x').defaultPrevented).toBe(true);
    expect(dispatcher.getState().pending).toEqual([]);
    press(document.body, 't');
    expect(other.calls).toHaveLength(1);
  });

  it('times out after a second', () => {
    vi.useFakeTimers();
    const { registry, dispatcher } = start(map);
    const tasks = recorder('nav.tasks');
    const other = recorder('other');
    registry.register([tasks.command, other.command]);

    press(document.body, 'g');
    vi.advanceTimersByTime(999);
    expect(dispatcher.getState().pending).toEqual(['g']);
    vi.advanceTimersByTime(1);
    expect(dispatcher.getState().pending).toEqual([]);
    press(document.body, 't');
    expect(tasks.calls).toHaveLength(0);
    expect(other.calls).toHaveLength(1);
  });

  it('restarts the timeout on each stroke, and takes the keymap’s own', () => {
    vi.useFakeTimers();
    const { registry, dispatcher } = start(
      keymap([{ scope: 'global', keys: 'a b c', command: 'abc' }], { sequenceTimeout: 500 }),
    );
    const abc = recorder('abc');
    registry.register([abc.command]);
    press(document.body, 'a');
    vi.advanceTimersByTime(400);
    press(document.body, 'b');
    vi.advanceTimersByTime(400);
    press(document.body, 'c');
    expect(abc.calls).toHaveLength(1);

    press(document.body, 'a');
    vi.advanceTimersByTime(500);
    expect(dispatcher.getState().pending).toEqual([]);
  });

  it('runs a shorter binding when a longer one it starts times out', () => {
    vi.useFakeTimers();
    const { registry } = start(
      keymap([
        { scope: 'global', keys: 'g', command: 'last' },
        { scope: 'global', keys: 'g g', command: 'first' },
      ]),
    );
    const last = recorder('last');
    const first = recorder('first');
    registry.register([last.command, first.command]);

    press(document.body, 'g');
    expect(last.calls).toHaveLength(0);
    press(document.body, 'g');
    expect(first.calls).toHaveLength(1);

    press(document.body, 'g');
    vi.advanceTimersByTime(1000);
    expect(last.calls).toHaveLength(1);
  });
});

describe('scopes', () => {
  it('lets the innermost scope’s binding win', () => {
    const { registry } = start(
      keymap([
        { scope: 'global', keys: 'x', command: 'global.x' },
        { scope: 'page', keys: 'x', command: 'page.x' },
        { scope: 'list', keys: 'x', command: 'list.x' },
      ]),
    );
    const g = recorder('global.x');
    const p = recorder('page.x');
    const l = recorder('list.x');
    registry.register([g.command, p.command, l.command]);

    const page = scoped(document.body, 'page');
    const list = scoped(page, 'list');
    press(button(list), 'x');
    press(button(page), 'x');
    press(document.body, 'x');
    expect([l.calls.length, p.calls.length, g.calls.length]).toEqual([1, 1, 1]);
  });

  it('only takes a scope’s bindings while focus is inside it', () => {
    const { registry } = start(keymap([{ scope: 'list', keys: 'j', command: 'list.down' }]));
    const down = recorder('list.down', 'list');
    registry.register([down.command]);
    const list = scoped(document.body, 'list');
    press(button(document.body), 'j');
    expect(down.calls).toHaveLength(0);
    press(button(list), 'j');
    expect(down.calls).toHaveLength(1);
  });

  it('falls through to an outer scope when the inner command is unavailable', () => {
    const { registry } = start(
      keymap([
        { scope: 'global', keys: 'x', command: 'global.x' },
        { scope: 'list', keys: 'x', command: 'list.x' },
      ]),
    );
    const g = recorder('global.x');
    registry.register([g.command]);
    press(button(scoped(document.body, 'list')), 'x');
    expect(g.calls).toHaveLength(1);
  });

  it('lets an inner single key beat an outer sequence it starts', () => {
    const { registry } = start(
      keymap([
        { scope: 'global', keys: 'g t', command: 'nav.tasks' },
        { scope: 'list', keys: 'g', command: 'list.first' },
      ]),
    );
    const first = recorder('list.first');
    registry.register([recorder('nav.tasks').command, first.command]);
    press(button(scoped(document.body, 'list')), 'g');
    expect(first.calls).toHaveLength(1);
  });

  it('tells the command where it ran', () => {
    const { registry } = start(keymap([{ scope: 'list', keys: 'j', command: 'list.down' }]));
    let scopes: readonly string[] = [];
    registry.register([
      { id: 'list.down', title: 'Down', scope: 'list', run: (ctx) => void (scopes = ctx.scopes) },
    ]);
    const page = scoped(document.body, 'page');
    press(button(scoped(page, 'list')), 'j');
    expect(scopes).toEqual(['list', 'page', 'global']);
  });
});

describe('modal dialogs', () => {
  const map = keymap([
    { scope: 'global', keys: 'c', command: 'task.new' },
    { scope: 'global', keys: 'mod+k', command: 'search.open', allowInTyping: true },
    { scope: 'list', keys: 'j', command: 'list.down' },
    { scope: 'dialog', keys: 'enter', command: 'dialog.confirm' },
  ]);

  function mount() {
    const ctx = start(map);
    const newTask = recorder('task.new');
    const search = recorder('search.open');
    const down = recorder('list.down', 'list');
    const confirm = recorder('dialog.confirm', 'dialog');
    ctx.registry.register([newTask.command, search.command, down.command, confirm.command]);
    const list = scoped(document.body, 'list');
    const row = button(list);
    return { ...ctx, newTask, search, down, confirm, list, row };
  }

  it('blocks every scope under an open dialog, global included', () => {
    const { newTask, search, down, confirm } = mount();
    const dialog = scoped(document.body, 'dialog', { modal: true });
    const inDialog = button(dialog);

    press(inDialog, 'c');
    press(inDialog, 'j');
    press(inDialog, 'k', { meta: true });
    expect([newTask.calls, down.calls, search.calls]).toEqual([[], [], []]);
    press(inDialog, 'Enter');
    expect(confirm.calls).toHaveLength(1);
  });

  it('blocks keys typed outside the dialog while it is open', () => {
    const { newTask, down, row } = mount();
    scoped(document.body, 'dialog', { modal: true });
    press(row, 'j');
    press(document.body, 'c');
    expect([newTask.calls, down.calls]).toEqual([[], []]);
  });

  it('counts focus on the popup around the scope as inside it', () => {
    const { confirm, newTask } = mount();
    const popup = document.createElement('div');
    popup.tabIndex = -1;
    document.body.appendChild(popup);
    scoped(popup, 'dialog', { modal: true });
    press(popup, 'Enter');
    press(popup, 'c');
    expect(confirm.calls).toHaveLength(1);
    expect(newTask.calls).toHaveLength(0);
  });

  it('only takes the top-most of nested dialogs', () => {
    const { confirm } = mount();
    const first = scoped(document.body, 'dialog', { modal: true });
    scoped(document.body, 'dialog', { modal: true });
    press(button(first), 'Enter');
    expect(confirm.calls).toHaveLength(0);
  });

  it('gives the keys back once it closes', () => {
    const { newTask } = mount();
    const dialog = scoped(document.body, 'dialog', { modal: true });
    dialog.remove();
    press(document.body, 'c');
    expect(newTask.calls).toHaveLength(1);
  });
});

describe('typing targets', () => {
  const map = keymap([
    { scope: 'global', keys: 'c', command: 'task.new' },
    { scope: 'global', keys: 'mod+k', command: 'search.open', allowInTyping: true },
    { scope: 'global', keys: 'mod+\\', command: 'sidebar.toggle', allowInEditor: true },
  ]);

  function mount() {
    const ctx = start(map);
    const newTask = recorder('task.new');
    const search = recorder('search.open');
    const sidebar = recorder('sidebar.toggle');
    ctx.registry.register([newTask.command, search.command, sidebar.command]);
    return { ...ctx, newTask, search, sidebar };
  }

  it.each(['input', 'textarea', 'select'])('ignores plain keys in a %s', (tag) => {
    const { newTask, search } = mount();
    const field = document.createElement(tag);
    document.body.appendChild(field);
    expect(press(field, 'c').defaultPrevented).toBe(false);
    expect(newTask.calls).toHaveLength(0);
    press(field, 'k', { meta: true });
    expect(search.calls).toHaveLength(1);
  });

  it('treats checkboxes and buttons as not typing', () => {
    const { newTask } = mount();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);
    press(checkbox, 'c');
    expect(newTask.calls).toHaveLength(1);
  });

  it('leaves contenteditable its keys unless a binding allows the editor', () => {
    const { newTask, search, sidebar } = mount();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const paragraph = document.createElement('p');
    editor.appendChild(paragraph);
    document.body.appendChild(editor);

    press(paragraph, 'c');
    // ⌘K is TipTap's Link in the editor
    press(paragraph, 'k', { meta: true });
    press(paragraph, '\\', { meta: true, code: 'Backslash' });
    expect([newTask.calls.length, search.calls.length, sidebar.calls.length]).toEqual([0, 0, 1]);
  });

  it('ignores IME composition unless a binding allows typing', () => {
    const { newTask, search } = mount();
    press(document.body, 'c', { isComposing: true });
    press(document.body, 'k', { meta: true, isComposing: true });
    expect([newTask.calls.length, search.calls.length]).toEqual([0, 1]);
  });
});

describe('counts', () => {
  it('are off by default: digits are keys', () => {
    const { registry, dispatcher } = start(
      keymap([{ scope: 'global', keys: 'j', command: 'list.down' }]),
    );
    const down = recorder('list.down');
    registry.register([down.command]);
    expect(press(document.body, '3').defaultPrevented).toBe(false);
    press(document.body, 'j');
    expect(down.calls).toEqual([{}]);
    expect(dispatcher.getState().count).toBeUndefined();
  });

  it('prefix a binding when the keymap takes them', () => {
    const { registry, dispatcher } = start(
      keymap(
        [
          { scope: 'global', keys: 'j', command: 'list.down' },
          { scope: 'global', keys: 'd d', command: 'row.trash' },
          { scope: 'global', keys: '0', command: 'list.start' },
        ],
        { counts: true },
      ),
    );
    const down = recorder('list.down');
    const trash = recorder('row.trash');
    const start0 = recorder('list.start');
    registry.register([down.command, trash.command, start0.command]);

    press(document.body, '1');
    press(document.body, '2');
    expect(dispatcher.getState().count).toBe(12);
    press(document.body, 'j');
    expect(down.calls).toEqual([{ count: 12 }]);
    expect(dispatcher.getState().count).toBeUndefined();

    press(document.body, '3');
    press(document.body, 'd');
    press(document.body, 'd');
    expect(trash.calls).toEqual([{ count: 3 }]);

    // a leading 0 is a key; after a digit it's part of the count
    press(document.body, '0');
    expect(start0.calls).toHaveLength(1);
    press(document.body, '1');
    press(document.body, '0');
    press(document.body, 'j');
    expect(down.calls[1]).toEqual({ count: 10 });
  });

  it('are dropped with a key that matches nothing', () => {
    const { registry, dispatcher } = start(
      keymap([{ scope: 'global', keys: 'j', command: 'list.down' }], { counts: true }),
    );
    const down = recorder('list.down');
    registry.register([down.command]);
    press(document.body, '4');
    press(document.body, 'x');
    expect(dispatcher.getState().count).toBeUndefined();
    press(document.body, 'j');
    expect(down.calls).toEqual([{}]);
  });

  it('are not read in typing targets', () => {
    const { dispatcher } = start(keymap([], { counts: true }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(press(input, '3').defaultPrevented).toBe(false);
    expect(dispatcher.getState().count).toBeUndefined();
  });
});

describe('modes', () => {
  const vimish = keymap(
    [
      { scope: 'global', mode: 'normal', keys: 'i', command: 'mode.insert' },
      { scope: 'global', mode: 'normal', keys: 'j', command: 'list.down' },
      { scope: 'global', mode: 'insert', keys: 'escape', command: 'mode.normal' },
      { scope: 'global', keys: 'mod+k', command: 'search.open' },
    ],
    { modes: ['normal', 'insert'] },
  );

  it('starts in the keymap’s first mode, and takes only its bindings and mode-less ones', () => {
    const { registry, dispatcher } = start(vimish);
    const down = recorder('list.down');
    const search = recorder('search.open');
    registry.register([
      down.command,
      search.command,
      { id: 'mode.insert', title: 'Insert', scope: 'global', run: (ctx) => ctx.setMode('insert') },
      { id: 'mode.normal', title: 'Normal', scope: 'global', run: (ctx) => ctx.setMode('normal') },
    ]);

    expect(dispatcher.getState().mode).toBe('normal');
    press(document.body, 'j');
    press(document.body, 'i');
    expect(dispatcher.getState().mode).toBe('insert');
    press(document.body, 'j');
    expect(down.calls).toHaveLength(1);
    press(document.body, 'k', { meta: true });
    expect(search.calls).toHaveLength(1);
    press(document.body, 'Escape');
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('has one implicit mode by default, and resets the mode a new keymap lacks', () => {
    const { dispatcher } = start(keymap([]));
    expect(dispatcher.getState().mode).toBe('default');
    dispatcher.setKeymap(vimish);
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('tells subscribers', () => {
    const { dispatcher } = start(vimish);
    const listener = vi.fn();
    dispatcher.subscribe(listener);
    dispatcher.setMode('insert');
    expect(listener).toHaveBeenCalled();
  });
});

describe('errors', () => {
  it('reports a command that throws, and still stops the key', () => {
    const { registry, errors } = start(keymap([{ scope: 'global', keys: 'c', command: 'boom' }]));
    registry.register([
      {
        id: 'boom',
        title: 'Boom',
        scope: 'global',
        run: () => {
          throw new Error('boom');
        },
      },
    ]);
    expect(press(document.body, 'c').defaultPrevented).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('stops listening once detached', () => {
    const ctx = setUp(keymap([{ scope: 'global', keys: 'c', command: 'task.new' }]));
    const newTask = recorder('task.new');
    ctx.registry.register([newTask.command]);
    ctx.detach();
    press(document.body, 'c');
    expect(newTask.calls).toHaveLength(0);
  });
});
