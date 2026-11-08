import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { SelectionBar } from '../SelectionBar';
import type { PickableStatus } from '../../entities/StatusMenu';
import { TaskRow, type TaskRowData, type TaskRowProps } from '../TaskRow';
import styles from './TaskList.module.css';

export interface TaskListProps extends Omit<ComponentProps<'div'>, 'children' | 'onSelect'> {
  /** core's tasks as they are (`TaskListItem`s) */
  tasks: TaskRowData[];
  /** the selected rows' ids, when controlled */
  selected?: string[];
  /** the rows selected at first, when uncontrolled */
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[]) => void;
  /** static hover or focus states by index, for pictures of the list */
  states?: Record<number, 'hover' | 'focus'>;
  /** the row whose status menu is open at first */
  menuOpenAt?: number;
  /**
   * every row shows its checkbox, as while something is selected; for a grouped list, where a
   * selection in one group shows the checkboxes in all of them
   */
  selecting?: boolean;
  /** indents every row (a task page's Subtasks list) */
  subtasks?: boolean;
  /** how the rows' pills stack: `auto` (the default) stacks each row's pills when it runs out of room */
  stack?: TaskRowProps['stack'];
  /** shows the SelectionBar while rows are selected; `false` leaves it to the page */
  selectionBar?: boolean;
  /** the bar sticks to the bottom of the scrolling list (default); `false` puts it under the rows */
  floatingBar?: boolean;
  /** the "more" menu's items in the SelectionBar */
  selectionMenu?: ReactNode;
  onStatusChange?: (task: TaskRowData, status: PickableStatus) => void;
  /** opens a task: a click on its row, or Enter */
  onOpen?: (task: TaskRowData) => void;
}

const idOf = (task: TaskRowData) => task.id as string;

/**
 * A list of `TaskRow`s that handles selection: rows selected next to each other join into one
 * block, every row shows its checkbox while anything is selected, and the `SelectionBar` floats
 * over the bottom of the list. ↑/↓ move between rows (one tab stop for the list), `X` selects,
 * `S` opens the status menu, Enter opens the task.
 */
export function TaskList({
  tasks,
  selected: selectedProp,
  defaultSelected = [],
  onSelectedChange,
  states,
  menuOpenAt,
  selecting,
  subtasks,
  stack,
  selectionBar = true,
  floatingBar = true,
  selectionMenu,
  onStatusChange,
  onOpen,
  className,
  onKeyDown,
  ...props
}: TaskListProps) {
  const [selectedState, setSelectedState] = useState<string[]>(defaultSelected);
  const selected = new Set(selectedProp ?? selectedState);
  const [focusIndex, setFocusIndex] = useState(0);
  const rows = useRef<Array<HTMLDivElement | null>>([]);

  function setSelected(next: Set<string>) {
    const list = [...next];
    setSelectedState(list);
    onSelectedChange?.(list);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const current = rows.current.findIndex((row) => row === document.activeElement);
    if (current < 0) return;
    const last = tasks.length - 1;
    const target =
      event.key === 'ArrowDown'
        ? Math.min(last, current + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, current - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target == null) return;
    event.preventDefault();
    setFocusIndex(target);
    rows.current[target]?.focus();
  }

  const count = tasks.filter((task) => selected.has(idOf(task))).length;
  const isSelected = (i: number) => i >= 0 && i < tasks.length && selected.has(idOf(tasks[i]));

  return (
    <div
      role="grid"
      aria-multiselectable
      className={cn(styles.list, className)}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {tasks.map((task, i) => {
        const id = idOf(task);
        const on = isSelected(i);
        return (
          <TaskRow
            key={id}
            ref={(el) => {
              rows.current[i] = el;
            }}
            task={task}
            tabIndex={i === Math.min(focusIndex, tasks.length - 1) ? 0 : -1}
            onFocus={() => setFocusIndex(i)}
            selected={on}
            selecting={selecting ?? count > 0}
            joinPrev={on && isSelected(i - 1)}
            joinNext={on && isSelected(i + 1)}
            state={states?.[i]}
            defaultMenuOpen={menuOpenAt === i}
            subtask={subtasks}
            stack={stack}
            onSelect={() => toggle(id)}
            onStatusChange={onStatusChange && ((status) => onStatusChange(task, status))}
            onOpen={onOpen && (() => onOpen(task))}
          />
        );
      })}
      {selectionBar && count > 0 && (
        <SelectionBar
          count={count}
          floating={floatingBar}
          className={styles.bar}
          more={selectionMenu}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
