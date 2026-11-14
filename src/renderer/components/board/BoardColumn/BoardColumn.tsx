import {
  forwardRef,
  Fragment,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
} from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { BoardCard, type BoardCardData, type BoardCardProps } from '../BoardCard';
import { IconButton } from '../../ui/IconButton';
import { Icon } from '../../ui/Icon';
import { StatusIcon } from '../../entities/StatusIcon';
import type { TaskStatus } from '@common/types';
import { TASK_STATUS_LABELS } from '../../types';
import { SIZE } from '@renderer/styles/tokens';
import { ScrollArea } from '../../ui/ScrollArea';
import styles from './BoardColumn.module.css';

export type BoardProps = ComponentPropsWithoutRef<'div'>;

/** The board: its columns side by side in equal widths, 24px apart. */
export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(styles.board, className)} {...props} />;
});

/** A task on the board: what a card draws, and the id it is kept by. */
export type BoardColumnTask = BoardCardData & { id: string };

/** What the column gives a card: the `BoardCard`'s props, with the ref it measures the card by. */
export type BoardColumnCardProps = BoardCardProps & { ref: RefCallback<HTMLDivElement> };

export interface BoardColumnProps extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
  /** the column's status: its icon, and its name unless `name` is given */
  status: TaskStatus;
  /** the heading; the status's name ("In progress") by default */
  name?: string;
  /** a count after the name; the designed board leaves it out (the cards show how many) */
  count?: number;
  /** end the column with the dashed "Add task" slot; false for Completed */
  add?: boolean;
  /** the header's "+" and the "Add task" slot */
  onAdd?: () => void;
  /** core's tasks for this status, as they are (`TaskListItem`s) */
  tasks: BoardColumnTask[];
  /** how many tasks the column has in all, loaded or not (each card's `aria-setsize`); the loaded ones by default */
  rowCount?: number;
  /** a click on a card, or Enter on it */
  onOpen?: (task: BoardColumnTask) => void;
  /** sets a due date on a task without one (its card's "Set due date") */
  onDueDateChange?: (task: BoardColumnTask, date: Date) => void;
  /**
   * more props for a task's `BoardCard` (a static `state` for pictures, a drag handle's props);
   * the column's own (its ref, role and position) are added to them
   */
  cardProps?: (task: BoardColumnTask, index: number) => Omit<BoardCardProps, 'task'>;
  /**
   * draws a card from the props the column gives it (spread them, `ref` included, onto a
   * `BoardCard`): for a page that wraps each card in a hook of its own, such as dragging. A
   * `BoardCard` by default
   */
  renderCard?: (props: BoardColumnCardProps, task: BoardColumnTask) => ReactNode;
  /** called when the last drawn card comes within `endReachedThreshold` cards of the end */
  onEndReached?: () => void;
  /** default 20 */
  endReachedThreshold?: number;
}

// a card's height before it is measured: the title, one line of pills and the meta line
const CARD_ESTIMATE = 96;
// the space between cards (board-card-gap): the virtualizer counts it into each card's offset, and
// the list draws it as its gap, since the cards flow rather than being placed at those offsets
const CARD_GAP = SIZE['board-card-gap'];

/**
 * An open status column: no panel, a 24px header (status icon, name, a ghost "+" on the right)
 * over its cards, 10px apart, and a dashed "Add task" slot. The column fills the board's height
 * and its cards scroll under the header, each column on its own; they are virtualized, so only
 * those in view (and about ten either side) are drawn, each measured as it draws, since pills can
 * wrap. ↑/↓ move between cards, scrolling the next into view first.
 */
export const BoardColumn = forwardRef<HTMLElement, BoardColumnProps>(function BoardColumn(
  {
    name: nameProp,
    status,
    count,
    add = true,
    onAdd,
    tasks,
    rowCount,
    onOpen,
    onDueDateChange,
    cardProps,
    renderCard = (card) => <BoardCard {...card} />,
    onEndReached,
    endReachedThreshold,
    className,
    ...props
  },
  ref,
) {
  const name = nameProp ?? TASK_STATUS_LABELS[status];
  // the cards area scrolls under the column's header; the board does not scroll
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualList({
    scrollerRef,
    count: tasks.length,
    estimateSize: () => CARD_ESTIMATE,
    gap: CARD_GAP,
    getItemKey: (index) => tasks[index].id,
    onEndReached,
    endReachedThreshold,
  });
  const items = virtualizer.getVirtualItems();

  // The cards drawn right now, by task id (each adds itself as it mounts and removes itself as it
  // scrolls out), for moving focus between them
  const drawn = useRef(new Map<string, HTMLElement>());
  const cardOf = (id: string) => drawn.current.get(id);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    const card = id ? cardOf(id) : undefined;
    if (card) {
      pendingFocus.current = null;
      card.focus({ preventScroll: true });
    }
  });

  // Enter opens the focused card; ↑/↓ move to the next card, scrolling it into view first. A key
  // the card has handled already (`preventDefault`) is left alone
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const card = event.target as HTMLElement;
    // a key the card handled itself (a card being dragged takes the arrows and Enter)
    if (event.defaultPrevented || !card.dataset.taskId) return;
    const current = tasks.findIndex((task) => task.id === card.dataset.taskId);
    if (current < 0) return;
    if (event.key === 'Enter') {
      if (!onOpen) return;
      event.preventDefault();
      onOpen(tasks[current]);
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const to = Math.min(tasks.length - 1, Math.max(0, current + step));
    const id = tasks[to].id;
    virtualizer.scrollToIndex(to, { align: 'auto' });
    const next = cardOf(id);
    if (next) next.focus({ preventScroll: true });
    else pendingFocus.current = id;
  }

  return (
    <section ref={ref} aria-label={name} className={cn(styles.column, className)} {...props}>
      <div className={styles.header}>
        <StatusIcon status={status} />
        {name}
        {count != null && <span className={styles.count}>{count}</span>}
        <IconButton
          size="xs"
          icon={Plus}
          label={`Add task to ${name}`}
          className={styles.add}
          onClick={onAdd}
        />
      </div>
      {/* a ScrollArea: the scrollbar is drawn over the column's edge, taking no width */}
      <ScrollArea
        className={styles.cardsArea}
        viewportRef={scrollerRef}
        viewportClassName={styles.cards}
      >
        {/*
         * The whole column's height, so the scrollbar is the whole column's; the drawn cards flow
         * inside it, in order, after the space the cards above them would take (paddingBefore),
         * CARD_GAP apart. Each card is a list item itself, measured as it draws, and counted for
         * screen readers ("card 212 of 340").
         */}
        <div
          role="list"
          aria-label={name}
          className={styles.list}
          style={{
            height: virtualizer.getTotalSize(),
            paddingTop: paddingBefore(items),
            gap: CARD_GAP,
          }}
          onKeyDown={handleKeyDown}
        >
          {items.map((item) => {
            const task = tasks[item.index];
            if (!task) return null;
            const card: BoardColumnCardProps = {
              task,
              onClick: onOpen && (() => onOpen(task)),
              onDueDateChange: onDueDateChange && ((date) => onDueDateChange(task, date)),
              ...cardProps?.(task, item.index),
              ref: (el) => {
                virtualizer.measureElement(el);
                if (el) drawn.current.set(task.id, el);
                else drawn.current.delete(task.id);
              },
              ...({
                'data-index': item.index,
                'data-task-id': task.id,
                role: 'listitem',
                'aria-posinset': item.index + 1,
                'aria-setsize': rowCount ?? tasks.length,
              } as object),
            };
            return <Fragment key={item.key}>{renderCard(card, task)}</Fragment>;
          })}
        </div>
        {add && (
          <button type="button" className={styles.slot} onClick={onAdd}>
            <Icon icon={Plus} size={16} />
            Add task
          </button>
        )}
      </ScrollArea>
    </section>
  );
});
