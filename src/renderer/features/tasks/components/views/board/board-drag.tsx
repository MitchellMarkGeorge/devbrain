import { forwardRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { TaskStatus, type TaskListItem } from '@common/types';
import {
  BoardCard,
  BoardColumn,
  TASK_STATUS_LABELS,
  type BoardCardProps,
  type BoardColumnProps,
} from '@renderer/components';
import { isSynced } from '../../../api/queries';
import styles from './TasksBoard.module.css';

// Dragging a card to another column on the board, with dnd-kit: by pointer, or from the keyboard
// (Space picks the focused card up, ← and → move it between columns, Space or Enter drops it, Esc
// puts it back). The columns are the drop targets, each by its status.

/** What a drag carries: the task, so the drop and the overlay don't look it up again. */
interface DragData {
  task: TaskListItem;
}

export function dragTask(data: unknown): TaskListItem | undefined {
  return (data as DragData | undefined)?.task;
}

/** A column that takes dropped cards; its drop target's id is its status. */
export const DroppableColumn = forwardRef<HTMLElement, BoardColumnProps>(
  function DroppableColumn(props, ref) {
    const { setNodeRef, isOver, active } = useDroppable({ id: props.status });
    // the column a card would move to: not the one it's in
    const target = isOver && dragTask(active?.data.current)?.status !== props.status;
    return (
      <BoardColumn
        {...props}
        ref={(el) => {
          setNodeRef(el);
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        data-drop-target={target ? '' : undefined}
      />
    );
  },
);

/**
 * A card that can be dragged: the column's props, with dnd-kit's. A synced task's can't be, as its
 * status is its provider's.
 */
export const DraggableCard = forwardRef<HTMLDivElement, BoardCardProps>(function DraggableCard(
  { task, onKeyDown, className, ...props },
  ref,
) {
  const full = task as TaskListItem & { id: string };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: full.id,
    data: { task: full } satisfies DragData,
    disabled: isSynced(full),
  });
  return (
    <BoardCard
      {...attributes}
      {...props}
      // the column's list item, not dnd-kit's button; the instructions are dnd-kit's
      role="listitem"
      task={task}
      ref={(el) => {
        setNodeRef(el);
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={isDragging ? `${styles.dragging} ${className ?? ''}` : className}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => listeners?.onPointerDown?.(event)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        listeners?.onKeyDown?.(event);
        // while it's dragged, the keys are the drag's (dnd-kit's, on the document): the column
        // skips a handled key, so the arrows don't move its focus and Enter doesn't open the card
        if (isDragging) event.preventDefault();
        onKeyDown?.(event);
      }}
    />
  );
});

/** The card under the pointer while one is dragged. */
export function DragPreview({ task }: { task: TaskListItem }) {
  return <BoardCard task={task} className={styles.preview} />;
}

// ← and → move a dragged card to the next column's left edge; ↑ and ↓ do nothing (a column's
// order is the page's sort)
const toNextColumn: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
  if (event.code === 'ArrowUp' || event.code === 'ArrowDown') event.preventDefault();
  if (step === 0) return undefined;
  event.preventDefault();
  const rects = [...context.droppableRects.values()].sort((a, b) => a.left - b.left);
  const over = context.over ? context.droppableRects.get(context.over.id) : undefined;
  const at = over ? rects.indexOf(over) : -1;
  const next = rects[at + step];
  return next ? { x: next.left, y: currentCoordinates.y } : undefined;
};

/** Pointer and keyboard; a press becomes a drag once the pointer moves 4px, so a click opens. */
export function useBoardSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: toNextColumn,
      // Enter opens a card, so only Space picks one up
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
}

/** The column under the pointer; from the keyboard, the column the card overlaps most. */
export const boardCollisions: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

const columnName = (id: unknown) => TASK_STATUS_LABELS[id as TaskStatus] ?? 'a column';
const titleOf = (data: unknown) => dragTask(data)?.title ?? 'The task';

/** What a screen reader hears, in the tasks' and columns' names. */
export const boardAnnouncements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${titleOf(active.data.current)}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${titleOf(active.data.current)} is over ${columnName(over.id)}.`
      : `${titleOf(active.data.current)} is no longer over a column.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `${titleOf(active.data.current)} was moved to ${columnName(over.id)}.`
      : `${titleOf(active.data.current)} was put back.`,
  onDragCancel: ({ active }) => `${titleOf(active.data.current)} was put back.`,
};

export const boardInstructions = {
  draggable:
    'To move a task to another column, press Space to pick it up, then the left and right ' +
    'arrow keys. Press Space or Enter to drop it, or Escape to put it back.',
};

/**
 * Each column's cards with a status change shown at once: a card whose task has moved to another
 * shown column (an optimistic drop, before the columns refetch) is drawn at the top of that column
 * instead, unless that column has it already. A failed write puts its status back, and the card
 * with it.
 */
export function placeCards<C extends { status: TaskStatus; tasks: TaskListItem[] }>(
  columns: C[],
): C[] {
  const shown = new Set(columns.map((column) => column.status));
  const home = new Set<string>();
  for (const column of columns) {
    for (const task of column.tasks) if (task.status === column.status) home.add(task.id);
  }
  const moved = new Map<TaskStatus, TaskListItem[]>();
  for (const column of columns) {
    for (const task of column.tasks) {
      if (task.status === column.status || !shown.has(task.status) || home.has(task.id)) continue;
      moved.set(task.status, [...(moved.get(task.status) ?? []), task]);
    }
  }
  return columns.map((column) => ({
    ...column,
    tasks: [
      ...(moved.get(column.status) ?? []),
      ...column.tasks.filter((task) => task.status === column.status || !shown.has(task.status)),
    ],
  }));
}
