// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vimKeymap } from '../../keyboard/vim-keymap';
import { defaultKeymap } from '../../keyboard/default-keymap';
import { MODE_CHANGE_EVENT } from '../../keyboard/keymap';
import { modeHints, pendingText } from '../../keyboard/ModeLine';
import { button, keymap, press, recorder, scoped, setUp } from './helpers';

// Vim's mode machine: the mode following focus into and out of typing targets, Esc leaving a
// field, a mode of an element's own (`data-key-mode`), counts and menus, and the mode line's text.

let detachAll: (() => void)[] = [];
function start(...args: Parameters<typeof setUp>) {
  const ctx = setUp(...args);
  detachAll.push(ctx.detach);
  return ctx;
}

const modal = keymap(
  [
    { scope: 'global', mode: 'normal', keys: 'j', command: 'list.down' },
    { scope: 'global', mode: 'normal', keys: 'v', command: 'visual' },
  ],
  { modes: ['normal', 'insert', 'visual', 'command'], insertMode: 'insert', counts: true },
);

function input(parent: Element = document.body): HTMLInputElement {
  const element = document.createElement('input');
  parent.appendChild(element);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const detach of detachAll) detach();
  detachAll = [];
  vi.useRealTimers();
});

describe('the mode following focus', () => {
  it('starts in the first mode', () => {
    const { dispatcher } = start(modal);
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('switches to insert in a text field and back once focus leaves it', () => {
    const { dispatcher } = start(modal);
    const field = input();
    const other = button(document.body);
    field.focus();
    expect(dispatcher.getState().mode).toBe('insert');
    other.focus();
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('switches to insert in the editor (contenteditable)', () => {
    const { dispatcher } = start(modal);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    expect(dispatcher.getState().mode).toBe('insert');
  });

  it('goes back to normal once a field is blurred to nowhere', () => {
    vi.useFakeTimers();
    const { dispatcher } = start(modal);
    const field = input();
    field.focus();
    field.blur();
    vi.runAllTimers();
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('keeps a mode a command set when focus moves between rows', () => {
    const { dispatcher } = start(modal);
    const first = button(document.body);
    const second = button(document.body);
    first.focus();
    dispatcher.setMode('visual');
    second.focus();
    expect(dispatcher.getState().mode).toBe('visual');
    // a text field still takes it to insert
    input().focus();
    expect(dispatcher.getState().mode).toBe('insert');
  });

  it('takes the mode of a data-key-mode element, and leaves it with focus', () => {
    const { dispatcher } = start(modal);
    const line = document.createElement('div');
    line.setAttribute('data-key-mode', 'command');
    document.body.appendChild(line);
    const field = input(line);
    field.focus();
    expect(dispatcher.getState().mode).toBe('command');
    button(document.body).focus();
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('follows an element changing its own mode while focus is in it (the editor’s)', () => {
    const { dispatcher } = start(modal);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.tabIndex = 0;
    editor.setAttribute('data-key-mode', 'normal');
    document.body.appendChild(editor);
    editor.focus();
    expect(dispatcher.getState().mode).toBe('normal');
    editor.setAttribute('data-key-mode', 'insert');
    editor.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { bubbles: true, detail: 'insert' }));
    expect(dispatcher.getState().mode).toBe('insert');
    // an element focus isn't in is not listened to
    const other = document.createElement('div');
    other.setAttribute('data-key-mode', 'visual');
    document.body.appendChild(other);
    other.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { bubbles: true }));
    expect(dispatcher.getState().mode).toBe('insert');
  });

  it('does nothing for a keymap whose mode doesn’t follow focus', () => {
    const { dispatcher } = start(defaultKeymap);
    input().focus();
    expect(dispatcher.getState().mode).toBe('default');
  });

  it('starts in insert when the keymap is swapped with a field focused', () => {
    const { dispatcher } = start(defaultKeymap);
    input().focus();
    dispatcher.setKeymap(modal);
    expect(dispatcher.getState().mode).toBe('insert');
  });
});

describe('Esc in a typing target', () => {
  it('leaves the field for normal mode', () => {
    const { dispatcher } = start(modal);
    const field = input();
    field.focus();
    const event = press(field, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(field);
    expect(dispatcher.getState().mode).toBe('normal');
  });

  it('leaves an Esc the page handled alone', () => {
    const { dispatcher } = start(modal);
    const field = input();
    field.addEventListener('keydown', (event) => event.preventDefault());
    field.focus();
    press(field, 'Escape');
    expect(document.activeElement).toBe(field);
    expect(dispatcher.getState().mode).toBe('insert');
  });

  it('leaves a dialog’s field to the dialog', () => {
    const { dispatcher } = start(modal);
    const dialog = scoped(document.body, 'dialog', { modal: true });
    const field = input(dialog);
    field.focus();
    press(field, 'Escape');
    expect(document.activeElement).toBe(field);
    expect(dispatcher.getState().mode).toBe('insert');
  });

  it('blurs the editor itself, not the paragraph the key was typed in', () => {
    const { dispatcher } = start(modal);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.tabIndex = 0;
    const paragraph = document.createElement('p');
    editor.appendChild(paragraph);
    document.body.appendChild(editor);
    editor.focus();
    press(paragraph, 'Escape');
    expect(document.activeElement).not.toBe(editor);
    expect(dispatcher.getState().mode).toBe('normal');
  });
});

describe('keys by mode', () => {
  it('runs a normal-mode binding only in normal mode', () => {
    const { registry, dispatcher } = start(modal);
    const { command, calls } = recorder('list.down');
    registry.register([command]);
    press(document.body, 'j');
    dispatcher.setMode('visual');
    press(document.body, 'j');
    expect(calls).toHaveLength(1);
  });

  it('reads no count in an open menu, whose digits are its own', () => {
    const { registry, dispatcher } = start(modal);
    registry.register([recorder('list.down').command]);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    const item = button(menu);
    item.focus();
    const event = press(item, '2');
    expect(event.defaultPrevented).toBe(false);
    expect(dispatcher.getState().count).toBeUndefined();
  });

  it('leaves letters in a menu to its typeahead unless the binding allows it', () => {
    const map = keymap(
      [
        { scope: 'global', keys: 'j', command: 'list.down' },
        { scope: 'global', keys: 'k', command: 'menu.up', allowInMenu: true },
      ],
      {},
    );
    const { registry } = start(map);
    const down = recorder('list.down');
    const up = recorder('menu.up');
    registry.register([down.command, up.command]);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    const item = button(menu);
    item.focus();
    press(item, 'j');
    press(item, 'k');
    expect(down.calls).toHaveLength(0);
    expect(up.calls).toHaveLength(1);
  });
});

describe('the Vim keymap', () => {
  it('has every mode the mode line draws, starting in normal', () => {
    expect(vimKeymap.modes).toEqual(['normal', 'insert', 'visual', 'hint', 'command']);
    expect(vimKeymap.insertMode).toBe('insert');
    expect(vimKeymap.counts).toBe(true);
  });

  it('binds no key to one command twice in one scope and mode', () => {
    const seen = new Set<string>();
    for (const entry of vimKeymap.entries) {
      const key = `${entry.scope}|${entry.mode ?? '*'}|${entry.keys}|${entry.command}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});

describe('the mode line', () => {
  it('writes a count and the strokes typed', () => {
    expect(pendingText(undefined, [])).toBe('');
    expect(pendingText(3, ['d'])).toBe('3d');
    expect(pendingText(undefined, ['g'])).toBe('g');
  });

  it('names the keys of the mode’s registered commands', () => {
    const registered = new Set(['help.shortcuts']);
    expect(modeHints(vimKeymap, 'normal', registered, 'macos')).toEqual([
      { keys: '?', label: 'keys' },
    ]);
    expect(modeHints(vimKeymap, 'insert', registered, 'macos')).toEqual([
      { keys: 'Esc', label: 'normal mode' },
    ]);
  });
});
