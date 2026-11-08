import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual';
import { cn } from '../../lib/cn';
import { paddingBefore, useVirtualList } from '../../lib/virtual';
import { SIZE, SPACING } from '../../../styles/tokens';
import { SelectionBar } from '../SelectionBar';
import type { PickableStatus } from '../../entities/StatusMenu';
import { TaskRow, type TaskRowData, type TaskRowProps } from '../TaskRow';
import styles from './TaskList.module.css';

/** One group of a grouped list: its heading, then its rows (none while `collapsed`). */
export interface TaskListGroup {
  /** identifies the group (its status, project id, date bucket) */
  id: string;
  /** the heading row: a `GroupHeading` */
  heading: ReactNode;
  tasks: TaskRowData[];
  /** leaves the group's rows out of the list; the heading stays */
  collapsed?: boolean;
  /** a row after the group's tasks while it has more to load: "Show more" */
  footer?: ReactNode;
}

export interface TaskListProps extends Omit<ComponentProps<'div'>, 'children' | 'onSelect'> {
  /** core's tasks as they are (`TaskListItem`s): a flat list. Leave out when `groups` is given */
  tasks?: TaskRowData[];
  /**
   * a grouped list: each group's heading, then its rows, in one virtualized list whose current
   * heading sticks to the top
   */
  groups?: TaskListGroup[];
  /**
   * how many rows the list has in all, loaded or not (`aria-rowcount`), when a count says so;
   * the loaded rows by default
   */
  rowCount?: number;
  /** called when the last rendered row comes within `endReachedThreshold` rows of the end */
  onEndReached?: () => void;
  /** default 20 */
  endReachedThreshold?: number;
  /** the selected rows' ids, when controlled */
  selected?: string[];
  /** the rows selected at first, when uncontrolled */
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[]) => void;
  /** the focused row's id, when controlled; the first row by default */
  focusedId?: string;
  onFocusedIdChange?: (id: string) => void;
  /** static hover or focus states by task index, for pictures of the list */
  states?: Record<number, 'hover' | 'focus'>;
  /** the task index whose status menu is open at first */
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

// One row of the flat list, with an `id` unique in the list: a task's own id, or its group's id
// for a heading (`group:…`) and a footer (`footer:…`)
type Entry =
  | { kind: 'task'; id: string; task: TaskRowData; taskIndex: number }
  | { kind: 'heading'; id: string; group: TaskListGroup; first: boolean }
  | { kind: 'footer'; id: string; group: TaskListGroup };

const idOf = (task: TaskRowData) => task.id as string;

// the flat list: each group's heading, its rows unless collapsed, and its footer
function entriesOf(tasks: TaskRowData[] | undefined, groups: TaskListGroup[] | undefined): Entry[] {
  let taskIndex = 0;
  const row = (task: TaskRowData): Entry => ({
    kind: 'task',
    id: idOf(task),
    task,
    taskIndex: taskIndex++,
  });
  if (!groups) return (tasks ?? []).map(row);
  return groups.flatMap((group, i) => [
    { kind: 'heading', id: `group:${group.id}`, group, first: i === 0 } as Entry,
    ...(group.collapsed ? [] : group.tasks.map(row)),
    ...(group.footer != null && !group.collapsed
      ? [{ kind: 'footer', id: `footer:${group.id}`, group } as Entry]
      : []),
  ]);
}

/**
 * A virtualized list of `TaskRow`s that handles selection. It is its own scroller: it fills the
 * height its container gives it (`flex: 1` in a column, or a set height) and scrolls its rows
 * there, under the page's header, drawing only the rows in view (and about ten either side). With
 * no height to fill it grows to its rows and draws them all, which suits a short list. Rows
 * selected next to each other join into one block, rows selected next to each other join into one block, every row shows
 * its checkbox while anything is selected, and the `SelectionBar` floats over the bottom of the
 * list. Focus and selection are kept as task ids, so they survive a row scrolling out of view.
 * ↑/↓ move between rows (scrolling a row into view before focusing it; one tab stop for the
 * list), Home/End jump to the first or last loaded row, `X` selects, `S` opens the status menu,
 * Enter opens the task. With `groups`, headings and rows share the one list and the current
 * group's heading sticks to the top.
 */
export function TaskList({
  tasks,
  groups,
  rowCount,
  onEndReached,
  endReachedThreshold,
  selected: selectedProp,
  defaultSelected = [],
  onSelectedChange,
  focusedId: focusedIdProp,
  onFocusedIdChange,
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
  onFocus,
  ...props
}: TaskListProps) {
  const entries = useMemo(() => entriesOf(tasks, groups), [tasks, groups]);
  const taskEntries = useMemo(
    () => entries.flatMap((entry, i) => (entry.kind === 'task' ? [i] : [])),
    [entries],
  );
  const headingIndexes = useMemo(
    () => entries.flatMap((entry, i) => (entry.kind === 'heading' ? [i] : [])),
    [entries],
  );

  const [selectedState, setSelectedState] = useState<string[]>(defaultSelected);
  const selected = new Set(selectedProp ?? selectedState);
  const [focusedState, setFocusedState] = useState<string | undefined>(undefined);
  const firstId = taskEntries.length
    ? idOf((entries[taskEntries[0]] as Extract<Entry, { kind: 'task' }>).task)
    : undefined;
  const indexOfId = useCallback(
    (id: string | undefined) => (id == null ? -1 : entries.findIndex((e) => e.id === id)),
    [entries],
  );
  const wanted = focusedIdProp ?? focusedState;
  const focusedId = indexOfId(wanted) >= 0 ? wanted : firstId;

  const listRef = useRef<HTMLDivElement>(null);

  // Every heading sticks to the top as it reaches it, the next one covering it. The heading of the
  // group at the top of the view stays drawn, ahead of the drawn rows, so it stays stuck even
  // once its own place has scrolled far above them.
  const headingAt = useCallback(
    (start: number) => {
      let active = -1;
      for (const index of headingIndexes) if (index <= start) active = index;
      return active;
    },
    [headingIndexes],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const active = headingAt(range.startIndex);
      const indexes = defaultRangeExtractor(range);
      return active >= 0 && !indexes.includes(active) ? [active, ...indexes] : indexes;
    },
    [headingAt],
  );

  const virtualizer = useVirtualList({
    scrollerRef: listRef,
    name: 'TaskList',
    count: entries.length,
    // A row is row-height; a heading is group-height and the space-1-5 under it, with the
    // group-gap above all but the first. Each is measured as it draws all the same, so a heading
    // that holds more (an event row under it) is placed right once drawn.
    estimateSize: (index) => {
      const entry = entries[index];
      if (entry.kind !== 'heading') return SIZE['row-height'];
      const heading = SIZE['group-height'] + SPACING['space-1-5'];
      return entry.first ? heading : heading + SIZE['group-gap'];
    },
    getItemKey: (index) => entries[index].id,
    rangeExtractor: groups ? rangeExtractor : undefined,
    onEndReached,
    endReachedThreshold,
  });

  // The task rows drawn right now, by task id: each row adds itself when it mounts and removes
  // itself when it scrolls out and unmounts, so this holds about the 30 rows in view, never the
  // whole list. Focus uses it to reach a row; a row asked to take focus before it is drawn (after
  // scrollToIndex brings it into range) waits in pendingFocus.
  const rows = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    const row = id ? rows.current.get(id) : undefined;
    if (row) {
      pendingFocus.current = null;
      row.focus({ preventScroll: true });
    }
  });

  function setFocused(id: string) {
    setFocusedState(id);
    onFocusedIdChange?.(id);
  }

  function focusTask(id: string) {
    setFocused(id);
    const index = indexOfId(id);
    const row = rows.current.get(id);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    if (row) row.focus({ preventScroll: true });
    else pendingFocus.current = id;
  }

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
    const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
    if (!row || row !== event.target) return;
    const current = taskEntries.indexOf(indexOfId(row.dataset.taskId));
    if (current < 0) return;
    const last = taskEntries.length - 1;
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
    focusTask(entries[taskEntries[target]].id);
  }

  // tabbing into the list while its focused row is scrolled away brings that row back
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    onFocus?.(event);
    if (event.target === event.currentTarget && focusedId) focusTask(focusedId);
  }

  const isSelectedAt = (index: number) => {
    const entry = entries[index];
    return entry?.kind === 'task' && selected.has(idOf(entry.task));
  };
  const count = entries.filter((e) => e.kind === 'task' && selected.has(idOf(e.task))).length;
  const items = virtualizer.getVirtualItems();
  const focusedDrawn = items.some((item) => entries[item.index]?.id === focusedId);

  return (
    <div
      ref={listRef}
      role="grid"
      aria-multiselectable
      aria-rowcount={rowCount ?? entries.length}
      tabIndex={focusedDrawn || !focusedId ? undefined : 0}
      className={cn(styles.list, className)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      {...props}
    >
      {/*
       * The whole list's height, so the scrollbar is the whole list's; the drawn rows flow inside
       * it, in index order, after the space above them (paddingBefore).
       */}
      <div
        className={styles.rows}
        style={{ height: virtualizer.getTotalSize(), paddingTop: paddingBefore(items) }}
      >
        {items.map((item) => {
          const entry = entries[item.index];
          if (!entry) return null;
          const rowIndex = item.index + 1;
          if (entry.kind !== 'task') {
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                role="row"
                aria-rowindex={rowIndex}
                data-gap={entry.kind === 'heading' && !entry.first ? '' : undefined}
                className={entry.kind === 'heading' ? styles.heading : styles.footer}
              >
                <div role="gridcell">
                  {entry.kind === 'heading' ? entry.group.heading : entry.group.footer}
                </div>
              </div>
            );
          }
          const { task, taskIndex } = entry;
          const id = idOf(task);
          const on = isSelectedAt(item.index);
          return (
            <TaskRow
              key={item.key}
              ref={(el) => {
                virtualizer.measureElement(el);
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              data-index={item.index}
              data-task-id={id}
              aria-rowindex={rowIndex}
              task={task}
              tabIndex={id === focusedId ? 0 : -1}
              onFocus={() => {
                if (id !== focusedId) setFocused(id);
              }}
              selected={on}
              selecting={selecting ?? count > 0}
              joinPrev={on && isSelectedAt(item.index - 1)}
              joinNext={on && isSelectedAt(item.index + 1)}
              state={states?.[taskIndex]}
              defaultMenuOpen={menuOpenAt === taskIndex}
              subtask={subtasks}
              stack={stack}
              onSelect={() => toggle(id)}
              onStatusChange={onStatusChange && ((status) => onStatusChange(task, status))}
              onOpen={onOpen && (() => onOpen(task))}
            />
          );
        })}
      </div>
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
