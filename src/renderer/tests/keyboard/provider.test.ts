// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppCommands,
  defaultKeymap,
  KeyboardProvider,
  KeyScope,
  shortcutSections,
  useCommands,
  useKeyboardState,
  type AppCommandActions,
  type Command,
  type KeyboardState,
} from '../../keyboard';
import { keymap, press } from './helpers';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

function render(node: ReactNode) {
  act(() => root.render(node));
}

function Commands({ commands, children }: { commands: Command[]; children?: ReactNode }) {
  useCommands(commands);
  return children ?? null;
}

function actions(): AppCommandActions {
  return {
    openSearch: vi.fn(),
    newTask: vi.fn(),
    newNote: vi.fn(),
    goTo: vi.fn(),
    openShortcuts: vi.fn(),
    toggleSidebar: vi.fn(),
  };
}

describe('the default keymap', () => {
  it.each([
    [['k'], { meta: true }, 'openSearch', undefined],
    [['c'], {}, 'newTask', undefined],
    [['n'], {}, 'newNote', undefined],
    [['g', 'h'], {}, 'goTo', 'home'],
    [['g', 't'], {}, 'goTo', 'tasks'],
    [['g', 'p'], {}, 'goTo', 'projects'],
    [['g', 'n'], {}, 'goTo', 'notes'],
    [['g', 'c'], {}, 'goTo', 'calendar'],
    [['?'], { shift: true }, 'openShortcuts', undefined],
    [['\\'], { meta: true, code: 'Backslash' }, 'toggleSidebar', undefined],
  ] as const)('%j runs %s', (keys, options, action, arg) => {
    const app = actions();
    render(
      createElement(
        KeyboardProvider,
        { keymap: defaultKeymap, platform: 'macos' },
        createElement(Commands, { commands: createAppCommands(app) }),
      ),
    );
    for (const key of keys) act(() => void press(document.body, key, options));
    expect(app[action]).toHaveBeenCalledTimes(1);
    if (arg) expect(app.goTo).toHaveBeenCalledWith(arg);
  });

  it('reads mod as Ctrl off macOS', () => {
    const app = actions();
    render(
      createElement(
        KeyboardProvider,
        { keymap: defaultKeymap, platform: 'windows' },
        createElement(Commands, { commands: createAppCommands(app) }),
      ),
    );
    act(() => void press(document.body, 'k', { ctrl: true }));
    expect(app.openSearch).toHaveBeenCalledTimes(1);
  });

  it('draws the shortcuts sheet’s sections', () => {
    const commands = createAppCommands(actions());
    const [everywhere] = shortcutSections(defaultKeymap, commands, 'default', 'macos');
    expect(everywhere.title).toBe('Everywhere');
    expect(everywhere.rows.slice(0, 4)).toEqual([
      { label: 'Search', bindings: [['⌘K']] },
      { label: 'New task', bindings: [['C']] },
      { label: 'New note', bindings: [['N']] },
      { label: 'Go to Home', bindings: [['G', 'H']] },
    ]);
  });
});

describe('shortcutSections', () => {
  const commands: Command[] = [
    { id: 'list.down', title: 'Down', scope: 'list', run: () => {} },
    { id: 'list.up', title: 'Up', scope: 'list', run: () => {} },
  ];

  it('merges entries sharing a label, groups by scope, and skips hidden and other modes', () => {
    const map = keymap(
      [
        { scope: 'list', mode: 'normal', keys: 'j', command: 'list.down', label: 'Down / up' },
        { scope: 'list', mode: 'normal', keys: 'k', command: 'list.up', label: 'Down / up' },
        { scope: 'list', mode: 'normal', keys: 'arrowdown', command: 'list.down', hidden: true },
        { scope: 'list', mode: 'visual', keys: 'j', command: 'list.down' },
        { scope: 'global', keys: 'x', command: 'unregistered' },
      ],
      { modes: ['normal', 'visual'], upperCaseKeys: false },
    );
    expect(shortcutSections(map, commands, 'normal', 'macos')).toEqual([
      { title: 'Lists', rows: [{ label: 'Down / up', bindings: [['j'], ['k']] }] },
    ]);
  });
});

describe('useCommands', () => {
  it('registers while mounted and unregisters on unmount', () => {
    const run = vi.fn();
    const map = keymap([{ scope: 'global', keys: 'x', command: 'demo' }]);
    const command: Command = { id: 'demo', title: 'Demo', scope: 'global', run };
    render(
      createElement(
        KeyboardProvider,
        { keymap: map },
        createElement(Commands, { commands: [command] }),
      ),
    );
    act(() => void press(document.body, 'x'));
    expect(run).toHaveBeenCalledTimes(1);

    render(createElement(KeyboardProvider, { keymap: map }));
    act(() => void press(document.body, 'x'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs the latest render’s closure without re-registering', () => {
    const seen: number[] = [];
    const map = keymap([{ scope: 'global', keys: 'x', command: 'demo' }]);
    const tree = (value: number) =>
      createElement(
        KeyboardProvider,
        { keymap: map },
        createElement(Commands, {
          commands: [
            { id: 'demo', title: 'Demo', scope: 'global', run: () => void seen.push(value) },
          ],
        }),
      );
    render(tree(1));
    render(tree(2));
    act(() => void press(document.body, 'x'));
    expect(seen).toEqual([2]);
  });
});

describe('KeyScope', () => {
  it('scopes keys to focus inside it, and a dialog scope is modal', () => {
    const down = vi.fn();
    const map = keymap([
      { scope: 'list', keys: 'j', command: 'list.down' },
      { scope: 'global', keys: 'c', command: 'task.new' },
    ]);
    const newTask = vi.fn();
    const commands: Command[] = [
      { id: 'list.down', title: 'Down', scope: 'list', run: down },
      { id: 'task.new', title: 'New task', scope: 'global', run: newTask },
    ];
    const tree = (dialog: boolean) =>
      createElement(
        KeyboardProvider,
        { keymap: map },
        createElement(
          Commands,
          { commands },
          createElement(KeyScope, { name: 'list' }, createElement('button', { id: 'row' })),
          dialog &&
            createElement(KeyScope, { name: 'dialog' }, createElement('button', { id: 'ok' })),
        ),
      );
    render(tree(false));
    const row = document.getElementById('row')!;
    expect(row.parentElement?.getAttribute('data-key-scope')).toBe('list');
    act(() => void press(row, 'j'));
    expect(down).toHaveBeenCalledTimes(1);

    render(tree(true));
    act(() => void press(row, 'j'));
    act(() => void press(document.getElementById('ok')!, 'c'));
    expect(down).toHaveBeenCalledTimes(1);
    expect(newTask).not.toHaveBeenCalled();
  });
});

describe('useKeyboardState', () => {
  it('follows the pending sequence', () => {
    const states: KeyboardState[] = [];
    function Status() {
      states.push(useKeyboardState());
      return null;
    }
    const map = keymap([{ scope: 'global', keys: 'g t', command: 'nav.tasks' }]);
    render(
      createElement(
        KeyboardProvider,
        { keymap: map },
        createElement(Commands, {
          commands: [{ id: 'nav.tasks', title: 'Tasks', scope: 'global', run: () => {} }],
        }),
        createElement(Status),
      ),
    );
    act(() => void press(document.body, 'g'));
    expect(states[states.length - 1].pending).toEqual(['g']);
    act(() => void press(document.body, 't'));
    expect(states[states.length - 1].pending).toEqual([]);
  });
});
