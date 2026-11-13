// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vimKeymap } from '../../keyboard/vim-keymap';
import { listCommands, type ListKeyTarget } from '../../keyboard/list-commands';
import { boardCommands, type BoardColumnKeyTarget } from '../../keyboard/board-commands';
import { cursorCommands } from '../../keyboard/cursor';
import { continuations } from '../../keyboard/ModeLine';
import type { Command } from '../../keyboard/commands';
import { SCOPE_ATTRIBUTE } from '../../keyboard/scopes';
import { UndoStack } from '../../keyboard/undo';
import { press, setUp } from './helpers';

// Vim's navigation over lists and the board: counts, gg/G, half pages, Visual ranges, dd and its
// count, `.`, undo and redo, entering the page's list from nowhere, j/k in menus, and the
// which-key popup.

interface Row {
  id: string;
}

// a list of `size` rows, focus at `focus`, that keeps a Visual range as the real lists do
function fakeList(size = 10, focus = 0) {
  const rows = Array.from({ length: size }, (_, i) => ({ id: `r${i}` }));
  const state = { focus, selected: new Set<number>(), anchor: null as number | null };
  const select = () => {
    if (state.anchor === null) return;
    state.selected = new Set();
    const [lo, hi] = [Math.min(state.anchor, state.focus), Math.max(state.anchor, state.focus)];
    for (let i = lo; i <= hi; i += 1) state.selected.add(i);
  };
  const to = (index: number) => {
    state.focus = Math.max(0, Math.min(size - 1, index));
    select();
  };
  const target: ListKeyTarget<Row> = {
    focusedItem: () => rows[state.focus],
    selectedItems: () => rows.filter((_, i) => state.selected.has(i)),
    moveFocus: (by) => to(state.focus + by),
    focusFirst: () => to(0),
    focusLast: () => to(size - 1),
    toggleSelected: () => {
      if (state.selected.has(state.focus)) state.selected.delete(state.focus);
      else state.selected.add(state.focus);
    },
    clearSelection: () => (state.selected = new Set()),
    openStatusMenu: () => {},
    pageSize: () => 6,
    startRange: () => {
      state.anchor = state.focus;
      select();
    },
    endRange: () => (state.anchor = null),
    itemsFromFocus: (count) => rows.slice(state.focus, state.focus + count),
  };
  return { target, state, rows };
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function region(scope: 'list' | 'board') {
  const element = document.createElement('div');
  element.setAttribute(SCOPE_ATTRIBUTE, scope);
  const row = document.createElement('div');
  row.tabIndex = 0;
  element.appendChild(row);
  document.body.appendChild(element);
  return { element, row };
}

function vim(commands: Command[] = []) {
  const ctx = setUp(vimKeymap);
  cleanup.push(ctx.detach, ctx.registry.register(commands));
  return ctx;
}

function typeKeys(target: Element, keys: string) {
  for (const key of keys) press(target, key);
}

describe('moving in a list', () => {
  it('moves by a count, to the ends, and by half a page', () => {
    const list = fakeList(20);
    vim(listCommands({ current: list.target }, {}));
    const { row } = region('list');
    row.focus();
    press(row, 'j');
    expect(list.state.focus).toBe(1);
    typeKeys(row, '5j');
    expect(list.state.focus).toBe(6);
    press(row, 'k');
    expect(list.state.focus).toBe(5);
    press(row, 'G');
    expect(list.state.focus).toBe(19);
    typeKeys(row, 'gg');
    expect(list.state.focus).toBe(0);
    press(row, 'd', { ctrl: true });
    expect(list.state.focus).toBe(3);
    typeKeys(row, '2');
    press(row, 'd', { ctrl: true });
    expect(list.state.focus).toBe(9);
    press(row, 'u', { ctrl: true });
    expect(list.state.focus).toBe(6);
  });
});

describe('a Visual range', () => {
  it('grows with the cursor from where v was pressed, and Esc drops it', () => {
    const list = fakeList(10, 2);
    const { dispatcher } = vim(listCommands({ current: list.target }, {}));
    const { row } = region('list');
    row.focus();
    press(row, 'v');
    expect(dispatcher.getState().mode).toBe('visual');
    typeKeys(row, 'jj');
    expect([...list.state.selected]).toEqual([2, 3, 4]);
    press(row, 'k');
    expect([...list.state.selected]).toEqual([2, 3]);
    press(row, 'Escape');
    expect(dispatcher.getState().mode).toBe('normal');
    expect(list.state.selected.size).toBe(0);
  });

  it('keeps the range with x, back in Normal', () => {
    const list = fakeList(10, 0);
    const { dispatcher } = vim(listCommands({ current: list.target }, {}));
    const { row } = region('list');
    row.focus();
    typeKeys(row, 'Vjx');
    expect(dispatcher.getState().mode).toBe('normal');
    expect([...list.state.selected]).toEqual([0, 1]);
    // moving no longer grows it
    press(row, 'j');
    expect([...list.state.selected]).toEqual([0, 1]);
  });

  it('trashes the range with d, ending it', () => {
    const list = fakeList(10, 1);
    const trash = vi.fn();
    const { dispatcher } = vim(listCommands({ current: list.target }, { trash }));
    const { row } = region('list');
    row.focus();
    typeKeys(row, 'vjjd');
    expect(trash).toHaveBeenCalledWith([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
    expect(dispatcher.getState().mode).toBe('normal');
  });
});

describe('dd, its count, and .', () => {
  it('trashes the focused row, or a count of rows from it', () => {
    const list = fakeList(10, 4);
    const trash = vi.fn();
    vim(listCommands({ current: list.target }, { trash }));
    const { row } = region('list');
    row.focus();
    typeKeys(row, 'dd');
    expect(trash).toHaveBeenLastCalledWith([{ id: 'r4' }]);
    typeKeys(row, '3dd');
    expect(trash).toHaveBeenLastCalledWith([{ id: 'r4' }, { id: 'r5' }, { id: 'r6' }]);
  });

  it('repeats the last change with ., and its count with a new one', () => {
    const list = fakeList(10, 0);
    const trash = vi.fn();
    const ctx = setUp(vimKeymap);
    cleanup.push(
      ctx.detach,
      ctx.registry.register(listCommands({ current: list.target }, { trash })),
    );
    // the provider registers `.`; here it's the dispatcher's repeat
    cleanup.push(
      ctx.registry.register([
        {
          id: 'app.repeat',
          title: 'Repeat',
          scope: 'global',
          run: (_, { count }) => void ctx.dispatcher.repeat(count),
        },
      ]),
    );
    const { row } = region('list');
    row.focus();
    typeKeys(row, '2dd');
    expect(trash).toHaveBeenCalledTimes(1);
    press(row, 'j');
    press(row, '.');
    expect(trash).toHaveBeenCalledTimes(2);
    expect(trash).toHaveBeenLastCalledWith([{ id: 'r1' }, { id: 'r2' }]);
    typeKeys(row, '3.');
    expect(trash).toHaveBeenLastCalledWith([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
  });
});

describe('undo and redo', () => {
  it('redoes what was undone, until something new is done', async () => {
    const stack = new UndoStack();
    const log: string[] = [];
    stack.push({
      label: 'a',
      undo: () => void log.push('undo a'),
      redo: () => void log.push('redo a'),
    });
    await stack.undo();
    expect(stack.redoSize).toBe(1);
    await stack.redo();
    expect(log).toEqual(['undo a', 'redo a']);
    expect(stack.size).toBe(1);
    await stack.undo();
    stack.push({ label: 'b', undo: () => {} });
    expect(stack.redoSize).toBe(0);
    expect(await stack.redo()).toBeUndefined();
  });

  it('can’t redo an entry without a redo, or one the toast took back', async () => {
    const stack = new UndoStack();
    stack.push({ label: 'a', undo: () => {} });
    await stack.undo();
    expect(stack.redoSize).toBe(0);
    const entry = { label: 'b', undo: () => {}, redo: () => {} };
    stack.push(entry);
    await stack.take(entry);
    expect(stack.redoSize).toBe(1);
  });

  it('binds u and Ctrl-r', async () => {
    const { registry, undoStack } = vim();
    const redo = vi.fn();
    cleanup.push(
      registry.register([
        { id: 'app.undo', title: 'Undo', scope: 'global', run: (ctx) => void ctx.undoStack.undo() },
        { id: 'app.redo', title: 'Redo', scope: 'global', run: (ctx) => void ctx.undoStack.redo() },
      ]),
    );
    undoStack.push({ label: 'a', undo: () => {}, redo });
    press(document.body, 'u');
    await vi.waitFor(() => expect(undoStack.redoSize).toBe(1));
    press(document.body, 'r', { ctrl: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalled());
  });
});

describe('the board', () => {
  function column(size: number) {
    const element = document.createElement('section');
    const cards = Array.from({ length: size }, () => {
      const card = document.createElement('div');
      card.tabIndex = 0;
      element.appendChild(card);
      return card;
    });
    let last = -1;
    const target: BoardColumnKeyTarget = {
      focusedIndex: () => last,
      focusCard: (index) => {
        last = index;
        cards[index]?.focus();
      },
      size: () => size,
      contains: (node) => element.contains(node),
    };
    return { element, cards, target };
  }

  function board(...sizes: number[]) {
    const { element } = region('board');
    const columns = sizes.map((size) => {
      const c = column(size);
      element.appendChild(c.element);
      return c;
    });
    return columns;
  }

  it('moves within a column with j/k and across with h/l, the sheet following', () => {
    const columns = board(3, 0, 2);
    const moved = vi.fn();
    const leave = vi.fn();
    vim(boardCommands({ current: columns.map((c) => c.target) }, { moved, leave }));
    columns[0].target.focusCard(2);
    const at = () => document.activeElement;
    press(at()!, 'k');
    expect(at()).toBe(columns[0].cards[1]);
    // l skips the empty column, to the card at the same place
    press(at()!, 'l');
    expect(at()).toBe(columns[2].cards[1]);
    expect(moved).toHaveBeenLastCalledWith({ column: 2, index: 1 });
    press(at()!, 'l');
    expect(leave).toHaveBeenCalledWith('right');
    press(at()!, 'G');
    expect(at()).toBe(columns[2].cards[1]);
    typeKeys(at()!, 'gg');
    expect(at()).toBe(columns[2].cards[0]);
    press(at()!, 'h');
    expect(at()).toBe(columns[0].cards[0]);
    press(at()!, 'h');
    expect(leave).toHaveBeenCalledWith('left');
  });

  it('opens and trashes the card under the cursor', () => {
    const columns = board(2, 2);
    const open = vi.fn();
    const trash = vi.fn();
    vim(boardCommands({ current: columns.map((c) => c.target) }, { open, trash }));
    columns[1].target.focusCard(1);
    press(document.activeElement!, 'o');
    expect(open).toHaveBeenCalledWith({ column: 1, index: 1 });
    typeKeys(document.activeElement!, 'dd');
    expect(trash).toHaveBeenCalledWith({ column: 1, index: 1 });
  });
});

describe('from nowhere, and in menus', () => {
  it('enters the page’s list with the first j', () => {
    vim(cursorCommands());
    const { row } = region('list');
    press(document.body, 'j');
    expect(document.activeElement).toBe(row);
  });

  it('makes j/k a menu’s arrows', () => {
    vim(cursorCommands());
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    item.tabIndex = 0;
    menu.appendChild(item);
    document.body.appendChild(menu);
    const arrows: string[] = [];
    menu.addEventListener('keydown', (event) => arrows.push(event.key));
    item.focus();
    press(item, 'j');
    press(item, 'k');
    // the j and k themselves are the keymap's: the menu sees only the arrows
    expect(arrows).toEqual(['ArrowDown', 'ArrowUp']);
  });
});

describe('the which-key popup', () => {
  const titles = new Map([
    ['nav.home', 'Go to Home'],
    ['nav.tasks', 'Go to Tasks'],
    ['list.first', 'First row'],
  ]);

  it('lists what can follow g, the innermost scope’s first', () => {
    const next = continuations(vimKeymap, ['g'], 'normal', ['list', 'global'], titles, 'macos');
    expect(next).toEqual([
      { key: 'g', label: 'First / last' },
      { key: 'h', label: 'Home' },
      { key: 't', label: 'Tasks' },
    ]);
  });

  it('lists nothing before a key is typed, and nothing unregistered', () => {
    expect(continuations(vimKeymap, [], 'normal', ['global'], titles, 'macos')).toEqual([]);
    expect(continuations(vimKeymap, ['g'], 'normal', ['global'], new Map(), 'macos')).toEqual([]);
  });
});
