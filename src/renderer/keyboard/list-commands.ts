import type { RefObject } from 'react';
import type { TaskStatus } from '@common/types';
import type { Command, CommandResult } from './commands';
import { useCommands } from './KeyboardProvider';

/**
 * What a list component does for the keyboard (`TaskList`'s `TaskListHandle` is one): it binds no
 * keys itself, and these commands drive it.
 */
export interface ListKeyTarget<Item> {
  focusedItem(): Item | undefined;
  selectedItems(): Item[];
  moveFocus(by: number): void;
  focusFirst(): void;
  focusLast(): void;
  toggleSelected(): void;
  clearSelection(): void;
  /** a list whose rows have a status menu (tasks) */
  openStatusMenu?(): void;
}

/**
 * What the page does with a list's rows. A row command acts on the selected rows, or on the
 * focused row when none is selected. An action left out registers no command, so its keys go
 * through and the shortcuts dialog leaves them out.
 */
export interface ListCommandActions<Item> {
  /** ↵: opens the focused row */
  open?: (item: Item) => void;
  /** `1`–`3` */
  setStatus?: (items: Item[], status: TaskStatus) => void;
  /** `F` */
  toggleFavorite?: (items: Item[]) => void;
  /** ⌘⌫: returns (or resolves to) the `Undoable` that restores them, for the undo stack */
  trash?: (items: Item[]) => CommandResult;
}

/**
 * The list keys' commands (`list.*`, `row.*`), registered while the list is mounted and bound in
 * the `list` scope: wrap the list in `<KeyScope name="list">`. `target` is the list's ref.
 */
export function listCommands<Item>(
  target: RefObject<ListKeyTarget<Item> | null>,
  actions: ListCommandActions<Item>,
): Command[] {
  const list = () => target.current;
  // the selected rows, or the focused one
  const rows = (): Item[] => {
    const current = list();
    if (!current) return [];
    const selected = current.selectedItems();
    if (selected.length > 0) return selected;
    const focused = current.focusedItem();
    return focused ? [focused] : [];
  };
  const command = (
    id: string,
    title: string,
    run: Command['run'],
    enabled?: Command['enabled'],
  ): Command => ({ id, title, scope: 'list', run, enabled });
  const { open, setStatus, toggleFavorite, trash } = actions;
  const commands: Command[] = [
    command('list.down', 'Next row', (_, { count = 1 }) => list()?.moveFocus(count)),
    command('list.up', 'Previous row', (_, { count = 1 }) => list()?.moveFocus(-count)),
    command('list.first', 'First row', () => list()?.focusFirst()),
    command('list.last', 'Last row', () => list()?.focusLast()),
    command('list.toggleSelect', 'Select', () => list()?.toggleSelected()),
    command(
      'list.clearSelection',
      'Clear selection',
      () => list()?.clearSelection(),
      () => (list()?.selectedItems().length ?? 0) > 0,
    ),
    command(
      'row.openStatusMenu',
      'Change status',
      () => list()?.openStatusMenu?.(),
      () => list()?.openStatusMenu !== undefined,
    ),
  ];
  if (open) {
    commands.push(
      command('row.open', 'Open', () => {
        const focused = list()?.focusedItem();
        if (focused) open(focused);
      }),
    );
  }
  if (setStatus) {
    commands.push(
      command('row.setStatus', 'Set status', (_, args) => {
        const items = rows();
        if (items.length > 0 && typeof args.status === 'number') {
          setStatus(items, args.status as TaskStatus);
        }
      }),
    );
  }
  if (toggleFavorite) {
    commands.push(
      command('row.favorite', 'Favorite', () => {
        const items = rows();
        if (items.length > 0) toggleFavorite(items);
      }),
    );
  }
  if (trash) {
    commands.push(
      command('row.trash', 'Move to trash', () => {
        const items = rows();
        return items.length > 0 ? trash(items) : undefined;
      }),
    );
  }
  return commands;
}

/** Registers `listCommands(target, actions)` while the component is mounted. */
export function useListCommands<Item>(
  target: RefObject<ListKeyTarget<Item> | null>,
  actions: ListCommandActions<Item>,
): void {
  useCommands(listCommands(target, actions));
}
