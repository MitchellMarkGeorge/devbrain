// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskStatus } from '@common/types';
import { defaultKeymap } from '../../keyboard/default-keymap';
import { listCommands, type ListKeyTarget } from '../../keyboard/list-commands';
import { SCOPE_ATTRIBUTE } from '../../keyboard/scopes';
import { press, setUp } from './helpers';

// The list keys as the default keymap binds them, over a fake list in a `list` scope.

interface Row {
  id: string;
}

function fakeList(selected: Row[] = []) {
  const calls: string[] = [];
  const target: ListKeyTarget<Row> = {
    focusedItem: () => ({ id: 'focused' }),
    selectedItems: () => selected,
    moveFocus: (by) => calls.push(`move ${by}`),
    focusFirst: () => calls.push('first'),
    focusLast: () => calls.push('last'),
    toggleSelected: () => calls.push('toggle'),
    clearSelection: () => calls.push('clear'),
    openStatusMenu: () => calls.push('menu'),
  };
  return { target, calls };
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.body.innerHTML = '';
});

// a focused row inside a list scope
function focusedRow() {
  const scope = document.createElement('div');
  scope.setAttribute(SCOPE_ATTRIBUTE, 'list');
  const row = document.createElement('div');
  row.tabIndex = 0;
  scope.appendChild(row);
  document.body.appendChild(scope);
  row.focus();
  return row;
}

function mount(selected: Row[] = [], actions: Parameters<typeof listCommands<Row>>[1] = {}) {
  const list = fakeList(selected);
  const { registry, detach, undoStack } = setUp(defaultKeymap);
  cleanup.push(detach, registry.register(listCommands({ current: list.target }, actions)));
  return { ...list, row: focusedRow(), undoStack };
}

describe('list keys', () => {
  it('move focus, select and open the status menu', () => {
    const { row, calls } = mount();
    press(row, 'ArrowDown');
    press(row, 'ArrowUp');
    press(row, 'Home');
    press(row, 'End');
    press(row, 'x');
    press(row, 's');
    expect(calls).toEqual(['move 1', 'move -1', 'first', 'last', 'toggle', 'menu']);
  });

  it('clear the selection with Esc only while something is selected', () => {
    expect(mount().calls).toEqual([]);
    const empty = mount();
    press(empty.row, 'Escape');
    expect(empty.calls).toEqual([]);
    const some = mount([{ id: 'a' }]);
    press(some.row, 'Escape');
    expect(some.calls).toEqual(['clear']);
  });

  it('act on the selection, or the focused row', () => {
    const setStatus = vi.fn();
    const toggleFavorite = vi.fn();
    const open = vi.fn();
    const one = mount([], { setStatus, toggleFavorite, open });
    press(one.row, '2');
    press(one.row, 'f');
    press(one.row, 'Enter');
    expect(setStatus).toHaveBeenCalledWith([{ id: 'focused' }], TaskStatus.IN_PROGRESS);
    expect(toggleFavorite).toHaveBeenCalledWith([{ id: 'focused' }]);
    expect(open).toHaveBeenCalledWith({ id: 'focused' });

    cleanup.forEach((fn) => fn());
    cleanup = [];
    const many = mount([{ id: 'a' }, { id: 'b' }], { setStatus });
    press(many.row, '3');
    expect(setStatus).toHaveBeenLastCalledWith([{ id: 'a' }, { id: 'b' }], TaskStatus.COMPLETED);
  });

  it('move to trash with ⌘⌫, putting what it returns on the undo stack', async () => {
    const undo = vi.fn();
    const trash = vi.fn(() => ({ label: 'Moved', undo }));
    const { row, undoStack } = mount([], { trash });
    press(row, 'Backspace', { meta: true });
    await vi.waitFor(() => expect(undoStack.size).toBe(1));
    expect(trash).toHaveBeenCalledWith([{ id: 'focused' }]);
  });

  it('leave keys whose action the page has not given to the page', () => {
    const { row } = mount();
    const event = press(row, 'f');
    expect(event.defaultPrevented).toBe(false);
  });
});
