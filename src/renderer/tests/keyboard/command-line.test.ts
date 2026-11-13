// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeCommandLine,
  resolveCommandLine,
  MAX_COMPLETIONS,
} from '../../keyboard/command-line';
import {
  KeyboardProvider,
  ModeLine,
  ShortcutsDialog,
  shortcutSections,
  useCommands,
  useKeyboardState,
  vimKeymap,
  type Command,
  type KeyboardState,
} from '../../keyboard';
import { press } from './helpers';

// Vim's `:` line: completion from the registry and its aliases, running a command where focus
// was, and the keys sheet with Vim on.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const command = (id: string, title: string): Command => ({
  id,
  title,
  scope: 'global',
  run: () => {},
});

const COMMANDS = [
  command('nav.tasks', 'Go to Tasks'),
  command('nav.notes', 'Go to Notes'),
  command('sort.priority', 'Sort by priority'),
  command('sort.due_date', 'Sort by due date'),
  command('sort.status', 'Sort by status'),
  command('view.board', 'Board view'),
  command('list.visual', 'Visual range'),
  command('app.undo', 'Undo'),
  command('mode.set', 'Change mode'),
];

describe('completing the : line', () => {
  it('completes an alias from what it starts with', () => {
    expect(completeCommandLine('sort p', COMMANDS)).toEqual([
      { text: 'sort priority', label: 'Sort by priority', command: 'sort.priority' },
    ]);
    expect(completeCommandLine('sort', COMMANDS).map((c) => c.text)).toEqual([
      'sort priority',
      'sort due',
      'sort status',
    ]);
  });

  it('completes a command by its id or title', () => {
    expect(completeCommandLine('list.v', COMMANDS).map((c) => c.text)).toEqual(['list.visual']);
    expect(completeCommandLine('range', COMMANDS).map((c) => c.text)).toEqual(['list.visual']);
  });

  it('offers each command once, by its alias, and none of the keyboard’s plumbing', () => {
    const texts = completeCommandLine('u', COMMANDS).map((c) => c.text);
    expect(texts).toEqual(['u']);
    expect(completeCommandLine('mode', COMMANDS)).toEqual([]);
    expect(completeCommandLine('tasks', COMMANDS).map((c) => c.command)).toEqual(['nav.tasks']);
  });

  it('offers no alias whose command isn’t registered, and at most a few', () => {
    expect(completeCommandLine('group', COMMANDS)).toEqual([]);
    expect(completeCommandLine('', COMMANDS).length).toBeLessThanOrEqual(MAX_COMPLETIONS);
  });

  it('resolves a whole alias or id typed out', () => {
    expect(resolveCommandLine('board', COMMANDS)?.command).toBe('view.board');
    expect(resolveCommandLine(' list.visual ', COMMANDS)?.command).toBe('list.visual');
    expect(resolveCommandLine('boa', COMMANDS)).toBeUndefined();
    expect(resolveCommandLine('mode.set', COMMANDS)).toBeUndefined();
  });
});

describe('the : line', () => {
  let root: Root;
  let container: HTMLElement;
  let state: KeyboardState | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
  });

  function Spy() {
    state = useKeyboardState();
    return null;
  }

  function Commands({ commands, children }: { commands: Command[]; children?: ReactNode }) {
    useCommands(commands);
    return children ?? null;
  }

  function render(commands: Command[], children?: ReactNode) {
    act(() =>
      root.render(
        createElement(
          KeyboardProvider,
          { keymap: vimKeymap, platform: 'macos' },
          createElement(Commands, { commands }, children),
          createElement(ModeLine),
          createElement(Spy),
        ),
      ),
    );
  }

  const input = () => document.querySelector<HTMLInputElement>('input[aria-label="Command"]');
  function type(text: string) {
    const field = input()!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('opens on :, completes, and runs the picked command where focus was', () => {
    const sort = vi.fn();
    const due = vi.fn();
    render(
      [
        { ...command('sort.priority', 'Sort by priority'), run: sort },
        { ...command('sort.due_date', 'Sort by due date'), run: due },
      ],
      createElement('button', { id: 'row' }, 'Row'),
    );
    const row = document.getElementById('row')!;
    act(() => row.focus());
    act(() => void press(row, ':'));
    expect(state?.mode).toBe('command');
    expect(document.activeElement).toBe(input());

    type('sort');
    const options = () =>
      [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options()).toEqual([':sort prioritySort by priority', ':sort dueSort by due date']);
    act(() => void press(input()!, 'Tab'));
    act(() => void press(input()!, 'Enter'));
    expect(due).toHaveBeenCalled();
    expect(sort).not.toHaveBeenCalled();
    expect(state?.mode).toBe('normal');
    expect(document.activeElement).toBe(row);
    expect(input()).toBeNull();
  });

  it('cancels with Esc, and with Backspace on an empty line', () => {
    render([]);
    act(() => void press(document.body, ':'));
    act(() => void press(input()!, 'Escape'));
    expect(state?.mode).toBe('normal');
    act(() => void press(document.body, ':'));
    act(() => void press(input()!, 'Backspace'));
    expect(state?.mode).toBe('normal');
  });

  it('runs a command typed out in full', () => {
    const visual = vi.fn();
    render([{ ...command('list.visual', 'Visual range'), run: visual }]);
    act(() => void press(document.body, ':'));
    type('nothing.like.it');
    act(() => void press(input()!, 'Enter'));
    expect(visual).not.toHaveBeenCalled();
    act(() => void press(document.body, ':'));
    type('list.visual');
    act(() => void press(input()!, 'Enter'));
    expect(visual).toHaveBeenCalled();
  });
});

describe('the keys sheet with Vim on', () => {
  it('lists the Vim keys in Normal mode, in Figma’s sections', () => {
    const registered = [
      'list.down',
      'list.up',
      'list.first',
      'list.last',
      'list.halfPageDown',
      'list.halfPageUp',
      'nav.home',
      'row.open',
      'row.trash',
      'app.undo',
      'app.redo',
      'hints.show',
      'commandLine.open',
      'help.shortcuts',
    ].map((id) => command(id, id));
    const sections = shortcutSections(vimKeymap, registered, 'normal', 'macos');
    expect(sections.map((s) => s.title)).toEqual(['Move', 'Go to', 'Act', 'Find']);
    const move = sections[0].rows;
    expect(move.find((r) => r.label === 'Down / up')?.bindings).toEqual([['j'], ['k']]);
    expect(move.find((r) => r.label === 'First / last')?.bindings).toEqual([['g', 'g'], ['G']]);
    expect(move.find((r) => r.label === 'Half a page')?.bindings).toEqual([['⌃D'], ['⌃U']]);
    const act = sections[2].rows;
    expect(act.find((r) => r.label === 'Undo / redo')?.bindings).toEqual([['u'], ['⌃R']]);
    const find = sections[3].rows.map((r) => r.label);
    expect(find).toEqual(expect.arrayContaining(['Keys', 'Hints', 'Command line']));
  });

  it('says Vim keys are on in its header', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(
          KeyboardProvider,
          { keymap: vimKeymap, platform: 'macos' },
          createElement(ShortcutsDialog, { open: true, onOpenChange: () => {} }),
        ),
      ),
    );
    expect(document.body.textContent).toContain('Vim keys on · Esc closes');
    act(() => root.unmount());
  });
});
