import type { RefObject } from 'react';
import type { TaskStatus } from '@common/types';
import type { Command, CommandContext, CommandResult } from './commands';
import { useCommands } from './KeyboardProvider';

// Vim's modes the list commands know: a range is Visual, and ends back in Normal
const VISUAL = 'visual';
const NORMAL = 'normal';

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
  /** how many rows fit in view, for half a page (Vim's `Ctrl-d`/`Ctrl-u`) */
  pageSize?(): number;
  /**
   * starts a range at the focused row (Vim's `v`): it is selected, and until `endRange` moving
   * focus selects every row from it to the focused one, and only those
   */
  startRange?(): void;
  /** stops a range growing as focus moves; what it selected stays selected */
  endRange?(): void;
  /** the focused row and the `count - 1` loaded rows after it, in list order (`3dd`) */
  itemsFromFocus?(count: number): Item[];
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
  // the selected rows, or the focused one (and the `count - 1` after it: `3dd`)
  const rows = (count = 1): Item[] => {
    const current = list();
    if (!current) return [];
    const selected = current.selectedItems();
    if (selected.length > 0) return selected;
    if (count > 1 && current.itemsFromFocus) return current.itemsFromFocus(count);
    const focused = current.focusedItem();
    return focused ? [focused] : [];
  };
  // a row command run on a Visual range ends it, keeping what it selected, back in Normal mode
  const leaveVisual = (ctx: CommandContext) => {
    if (ctx.mode !== VISUAL) return;
    list()?.endRange?.();
    ctx.setMode(NORMAL);
  };
  const halfPage = () => Math.max(1, Math.ceil((list()?.pageSize?.() ?? 2) / 2));
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
    command(
      'list.halfPageDown',
      'Half a page down',
      (_, { count = 1 }) => list()?.moveFocus(halfPage() * count),
      () => list()?.pageSize !== undefined,
    ),
    command(
      'list.halfPageUp',
      'Half a page up',
      (_, { count = 1 }) => list()?.moveFocus(-halfPage() * count),
      () => list()?.pageSize !== undefined,
    ),
    // in Visual mode, `x` keeps the range selected and goes back to Normal
    command('list.toggleSelect', 'Select', (ctx) => {
      if (ctx.mode === VISUAL) leaveVisual(ctx);
      else list()?.toggleSelected();
    }),
    command(
      'list.clearSelection',
      'Clear selection',
      () => list()?.clearSelection(),
      () => (list()?.selectedItems().length ?? 0) > 0,
    ),
    command(
      'list.visual',
      'Visual range',
      (ctx) => {
        list()?.startRange?.();
        ctx.setMode(VISUAL);
      },
      () => list()?.startRange !== undefined && list()?.focusedItem() !== undefined,
    ),
    // Esc in Visual mode: the range is dropped, selection and all
    command('list.cancelVisual', 'Cancel range', (ctx) => {
      list()?.endRange?.();
      list()?.clearSelection();
      ctx.setMode(NORMAL);
    }),
    command(
      'row.openStatusMenu',
      'Change status',
      (ctx) => {
        leaveVisual(ctx);
        list()?.openStatusMenu?.();
      },
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
      command('row.setStatus', 'Set status', (ctx, args) => {
        leaveVisual(ctx);
        const items = rows();
        if (items.length > 0 && typeof args.status === 'number') {
          setStatus(items, args.status as TaskStatus);
        }
      }),
    );
  }
  if (toggleFavorite) {
    commands.push(
      command('row.favorite', 'Favorite', (ctx, { count }) => {
        leaveVisual(ctx);
        const items = rows(count);
        if (items.length > 0) toggleFavorite(items);
      }),
    );
  }
  if (trash) {
    commands.push(
      command('row.trash', 'Move to trash', (ctx, { count }) => {
        leaveVisual(ctx);
        const items = rows(count);
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
