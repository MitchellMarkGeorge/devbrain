import type { RefObject } from 'react';
import type { Command, CommandResult } from './commands';
import { useCommands } from './KeyboardProvider';

/**
 * What a board column does for the keyboard (`BoardColumn`'s `BoardColumnHandle` is one): it moves
 * focus between its cards, and these commands move between columns.
 */
export interface BoardColumnKeyTarget {
  /** the card with focus, or the one that had it last; -1 before any has */
  focusedIndex(): number;
  focusCard(index: number): void;
  size(): number;
  contains(node: Node | null): boolean;
}

/** Where the cursor is on a board: a column, and a card in it. */
export interface BoardCursor {
  column: number;
  index: number;
}

/**
 * What the page does with the board's cards, by where they are. An action left out registers no
 * command.
 */
export interface BoardCommandActions {
  /** `o`: opens the focused card */
  open?: (cursor: BoardCursor) => void;
  /** `*` */
  toggleFavorite?: (cursor: BoardCursor) => void;
  /** `dd`: returns (or resolves to) the `Undoable` that restores it */
  trash?: (cursor: BoardCursor) => CommandResult;
  /** after the cursor moved to another card (the sheet follows it) */
  moved?: (cursor: BoardCursor) => void;
  /** `h` in the first column or `l` in the last: focus goes out of the board (the sidebar, the sheet) */
  leave?: (side: 'left' | 'right') => void;
}

/**
 * The board keys' commands (`board.*`), registered while the board is mounted and bound in the
 * `board` scope: `j`/`k` within a column, `h`/`l` between columns (to the card at the same place,
 * or the last), `gg`/`G`. `columns` gives the columns in order, as drawn.
 */
export function boardCommands(
  columns: RefObject<readonly (BoardColumnKeyTarget | null)[]>,
  actions: BoardCommandActions,
  doc: Document = document,
): Command[] {
  const all = () => columns.current ?? [];
  const cursor = (): BoardCursor | undefined => {
    const list = all();
    const column = list.findIndex((target) => target?.contains(doc.activeElement) ?? false);
    if (column < 0) return undefined;
    return { column, index: Math.max(0, list[column]!.focusedIndex()) };
  };
  const moveTo = (column: number, index: number) => {
    const target = all()[column];
    if (!target || target.size() === 0) return;
    const clamped = Math.min(target.size() - 1, Math.max(0, index));
    target.focusCard(clamped);
    actions.moved?.({ column, index: clamped });
  };
  // moves within the focused card's column: to `to(here, size)`
  const within =
    (to: (here: BoardCursor, size: number, count: number) => number): Command['run'] =>
    (_, { count = 1 }) => {
      const here = cursor();
      if (here) moveTo(here.column, to(here, all()[here.column]!.size(), count));
    };
  // the next column with cards, `step` at a time; past the edge, `leave`
  const across =
    (step: -1 | 1): Command['run'] =>
    (_, { count = 1 }) => {
      const here = cursor();
      if (!here) return;
      const list = all();
      const filled = (column: number) => (list[column]?.size() ?? 0) > 0;
      let column = here.column;
      for (let moved = 0; moved < count; ) {
        let next = column + step;
        while (next >= 0 && next < list.length && !filled(next)) next += step;
        if (next < 0 || next >= list.length) break;
        column = next;
        moved += 1;
      }
      if (column === here.column) actions.leave?.(step < 0 ? 'left' : 'right');
      else moveTo(column, here.index);
    };
  const onBoard = () => cursor() !== undefined;
  const command = (id: string, title: string, run: Command['run']): Command => ({
    id,
    title,
    scope: 'board',
    run,
    enabled: onBoard,
  });
  const commands: Command[] = [
    command(
      'board.down',
      'Next card',
      within(({ index }, _, count) => index + count),
    ),
    command(
      'board.up',
      'Previous card',
      within(({ index }, _, count) => index - count),
    ),
    command(
      'board.first',
      'First card',
      within(() => 0),
    ),
    command(
      'board.last',
      'Last card',
      within((_, size) => size - 1),
    ),
    command('board.left', 'Column to the left', across(-1)),
    command('board.right', 'Column to the right', across(1)),
  ];
  const { open, toggleFavorite, trash } = actions;
  if (open) {
    commands.push(
      command('board.open', 'Open', () => {
        const here = cursor();
        if (here) open(here);
      }),
    );
  }
  if (toggleFavorite) {
    commands.push(
      command('board.favorite', 'Favorite', () => {
        const here = cursor();
        if (here) toggleFavorite(here);
      }),
    );
  }
  if (trash) {
    commands.push(
      command('board.trash', 'Move to trash', () => {
        const here = cursor();
        return here ? trash(here) : undefined;
      }),
    );
  }
  return commands;
}

/** Registers `boardCommands(columns, actions)` while the component is mounted. */
export function useBoardCommands(
  columns: RefObject<readonly (BoardColumnKeyTarget | null)[]>,
  actions: BoardCommandActions,
): void {
  useCommands(boardCommands(columns, actions));
}
