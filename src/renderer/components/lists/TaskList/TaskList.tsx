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
  type RefObject,
} from 'react';
import {
  GroupedVirtuoso,
  Virtuoso,
  type ContextProp,
  type GroupProps,
  type GroupedVirtuosoHandle,
  type ItemProps,
  type ListRange,
  type TopItemListProps,
  type VirtuosoHandle,
} from 'react-virtuoso';
import { cn } from '../../lib/cn';
import { UNBOUNDED_ROWS, unboundedWarning } from '../../lib/virtual';
import { SIZE } from '../../../styles/tokens';
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

// One entry of the flat list, with an `id` unique in the list: a task's own id, or its group's
// id for a heading (`group:…`), a footer (`footer:…`) and the group-gap after it (`gap:…`).
// Virtuoso's `data-index` on every item and group is its index here.
//
// The gap is the last item of every group but the last, not space at the top of the next heading:
// Virtuoso sticks a group's heading as soon as the top of the heading's box reaches the top of the
// list, so a gap inside the box would make the heading jump up by the gap and open a blank strip
// under it. It is not a row: it has no role and no `aria-rowindex`.
type Entry =
  | { kind: 'task'; id: string; task: TaskRowData; taskIndex: number }
  | { kind: 'heading'; id: string; group: TaskListGroup }
  | { kind: 'footer'; id: string; group: TaskListGroup }
  | { kind: 'gap'; id: string };
type TaskEntry = Extract<Entry, { kind: 'task' }>;

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
    { kind: 'heading', id: `group:${group.id}`, group } as Entry,
    ...(group.collapsed ? [] : group.tasks.map(row)),
    ...(footerShown(group) ? [{ kind: 'footer', id: `footer:${group.id}`, group } as Entry] : []),
    ...(i < groups.length - 1 ? [{ kind: 'gap', id: `gap:${group.id}` } as Entry] : []),
  ]);
}

const footerShown = (group: TaskListGroup) => group.footer != null && !group.collapsed;

// each entry's `aria-rowindex`: its place among the rows, which leave out the gaps
function rowIndexesOf(entries: Entry[]): number[] {
  let row = 0;
  return entries.map((entry) => (entry.kind === 'gap' ? 0 : ++row));
}

// rows drawn beyond the visible ones, above and below: about ten rows' height
const OVERSCAN = 10 * SIZE['row-height'];

// What the rows need from the list. Virtuoso hands it to the components below, which stay the
// same across renders (new ones would remount every row).
interface ListContext {
  entries: Entry[];
  rowIndexes: number[];
  focusedId: string | undefined;
  selected: Set<string>;
  selecting: boolean;
  states: TaskListProps['states'];
  menuOpenAt: number | undefined;
  subtasks: boolean | undefined;
  stack: TaskRowProps['stack'];
  bar: ReactNode;
  /** adds a drawn task row to the list's rows, until the returned cleanup */
  registerRow: (id: string, row: HTMLDivElement) => () => void;
  setFocusedRowDrawn: (drawn: boolean) => void;
  setFocused: (id: string) => void;
  toggle: (id: string) => void;
  onStatusChange: TaskListProps['onStatusChange'];
  onOpen: TaskListProps['onOpen'];
}

const isSelectedAt = (context: ListContext, index: number) => {
  const entry = context.entries[index];
  return entry?.kind === 'task' && context.selected.has(entry.id);
};

// Virtuoso's item: the TaskRow itself (or a footer's row), with Virtuoso's data attributes and
// style on it, so the row is what Virtuoso measures and there is no wrapper
function Item({ context, ...item }: ItemProps<unknown> & ContextProp<ListContext>) {
  const index = item['data-index'];
  const props: VirtuosoAttributes = {
    'data-index': index,
    'data-item-index': item['data-item-index'],
    'data-item-group-index': item['data-item-group-index'],
    'data-known-size': item['data-known-size'],
    style: item.style,
  };
  const entry = context.entries[index];
  if (!entry) return null;
  if (entry.kind === 'task') return <Row {...props} entry={entry} context={context} />;
  if (entry.kind === 'gap') return <div {...props} aria-hidden className={styles.gap} />;
  return (
    <div {...props} role="row" aria-rowindex={context.rowIndexes[index]} className={styles.footer}>
      <div role="gridcell">{entry.group.footer}</div>
    </div>
  );
}

// what Virtuoso puts on an item for measuring it, which the row carries itself
type VirtuosoAttributes = Omit<ItemProps<unknown>, 'item' | 'children'>;

type RowProps = VirtuosoAttributes & {
  entry: TaskEntry;
  context: ListContext;
};

function Row({ entry, context, ...props }: RowProps) {
  const index = props['data-index'];
  const { id, task, taskIndex } = entry;
  const { registerRow, setFocusedRowDrawn, setFocused, toggle } = context;
  const ref = useRef<HTMLDivElement>(null);
  const focused = id === context.focusedId;

  useEffect(() => (ref.current ? registerRow(id, ref.current) : undefined), [id, registerRow]);

  // the list is its own tab stop only while the focused row is scrolled away
  useEffect(() => {
    if (!focused) return;
    setFocusedRowDrawn(true);
    return () => setFocusedRowDrawn(false);
  }, [focused, setFocusedRowDrawn]);

  const on = isSelectedAt(context, index);
  return (
    <TaskRow
      {...props}
      ref={ref}
      data-task-id={id}
      aria-rowindex={context.rowIndexes[index]}
      task={task}
      tabIndex={focused ? 0 : -1}
      onFocus={() => {
        if (!focused) setFocused(id);
      }}
      selected={on}
      selecting={context.selecting}
      joinPrev={on && isSelectedAt(context, index - 1)}
      joinNext={on && isSelectedAt(context, index + 1)}
      state={context.states?.[taskIndex]}
      defaultMenuOpen={context.menuOpenAt === taskIndex}
      subtask={context.subtasks}
      stack={context.stack}
      onSelect={() => toggle(id)}
      onStatusChange={
        context.onStatusChange && ((status) => context.onStatusChange?.(task, status))
      }
      onOpen={context.onOpen && (() => context.onOpen?.(task))}
    />
  );
}

// A group's heading, in the list or stuck at the top (Virtuoso's top item list). Virtuoso makes it
// `position: sticky` with no offset; the heading's own stacking (styles.heading) replaces that.
function Group({ context, style, ...props }: GroupProps & ContextProp<ListContext>) {
  const index = props['data-index'];
  const entry = context.entries[index];
  if (entry?.kind !== 'heading') return null;
  return (
    <div
      {...props}
      style={{ ...style, position: undefined, zIndex: undefined }}
      role="row"
      aria-rowindex={context.rowIndexes[index]}
      className={styles.heading}
    >
      <div role="gridcell">{entry.group.heading}</div>
    </div>
  );
}

// The current group's heading, stuck to the top, under the next heading as it arrives (styles.top)
function TopItemList({ style, children }: TopItemListProps & ContextProp<ListContext>) {
  return (
    <div style={{ ...style, top: undefined, zIndex: undefined }} className={styles.top}>
      {children}
    </div>
  );
}

// after the rows: the SelectionBar, whose wrapper styles.list makes sticky
function Footer({ context }: ContextProp<ListContext>) {
  return context.bar;
}

const components = { Item, Group, TopItemList, Footer };
const noContent = () => null;
const keyOf = (index: number, _item: unknown, context: ListContext) =>
  context.entries[index]?.id ?? index;

/**
 * A virtualized list of `TaskRow`s that handles selection, on react-virtuoso. It is its own
 * scroller: it fills the height its container gives it (`flex: 1` in a column, or a set height)
 * and scrolls its rows there, under the page's header, drawing only the rows in view (and about
 * ten either side). With no height to fill it grows to its rows and draws them all, which suits a
 * short list. Rows selected next to each other join into one block, every row shows its checkbox
 * while anything is selected, and the `SelectionBar` floats over the bottom of the list. Focus and
 * selection are kept as task ids, so they survive a row scrolling out of view. ↑/↓ move between
 * rows (scrolling a row into view before focusing it; one tab stop for the list), Home/End jump
 * to the first or last loaded row, `X` selects, `S` opens the status menu, Enter opens the task.
 * With `groups`, headings and rows share the one list (`GroupedVirtuoso`) and the current group's
 * heading sticks to the top.
 */
export function TaskList({
  tasks,
  groups,
  rowCount,
  onEndReached,
  endReachedThreshold = 20,
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
  style,
  onKeyDown,
  onFocus,
  ...props
}: TaskListProps) {
  const entries = useMemo(() => entriesOf(tasks, groups), [tasks, groups]);
  const rowIndexes = useMemo(() => rowIndexesOf(entries), [entries]);
  const taskEntries = useMemo(
    () => entries.flatMap((entry, i) => (entry.kind === 'task' ? [i] : [])),
    [entries],
  );
  // Virtuoso counts a grouped list's items without their headings: an entry's index among those
  const itemIndexOf = useMemo(() => {
    let headings = 0;
    return entries.map((entry, i) => (entry.kind === 'heading' ? headings++ : i - headings));
  }, [entries]);
  const groupCounts = useMemo(
    () =>
      groups?.map(
        (g, i) =>
          (g.collapsed ? 0 : g.tasks.length) +
          (footerShown(g) ? 1 : 0) +
          (i < groups.length - 1 ? 1 : 0),
      ) ?? [],
    [groups],
  );
  const itemCount = groups ? groupCounts.reduce((a, b) => a + b, 0) : entries.length;

  const [selectedState, setSelectedState] = useState<string[]>(defaultSelected);
  const selected = new Set(selectedProp ?? selectedState);
  const [focusedState, setFocusedState] = useState<string | undefined>(undefined);
  const firstId = taskEntries.length ? entries[taskEntries[0]].id : undefined;
  const indexOfId = useCallback(
    (id: string | undefined) => (id == null ? -1 : entries.findIndex((e) => e.id === id)),
    [entries],
  );
  const wanted = focusedIdProp ?? focusedState;
  const focusedId = indexOfId(wanted) >= 0 ? wanted : firstId;

  const virtuoso = useRef<VirtuosoHandle | GroupedVirtuosoHandle>(null);
  const scroller = useRef<HTMLElement | null>(null);
  // The task rows drawn right now, by task id: each adds itself when it mounts and leaves when it
  // scrolls out, so this holds the rows in view, never the whole list. A row asked to take focus
  // before it was drawn (scrollIntoView brings it into range) waits in pendingFocus.
  const rows = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<string | null>(null);
  const registerRow = useCallback((id: string, row: HTMLDivElement) => {
    rows.current.set(id, row);
    if (pendingFocus.current === id) {
      pendingFocus.current = null;
      row.focus({ preventScroll: true });
    }
    return () => {
      if (rows.current.get(id) === row) rows.current.delete(id);
    };
  }, []);
  const [focusedRowDrawn, setFocusedRowDrawn] = useState(false);

  // A list with no height to fill still draws all its rows: Virtuoso's viewport is positioned, so
  // the scroller would collapse to nothing. Its height is the whole list's (--list-height, from
  // Virtuoso's total), which a flex column or a set height shrinks to the room it gives (flex: 1,
  // min-height: 0, max-height: 100% in styles.list). Set on the element, not through React, so a
  // row measuring differently doesn't render the whole list again.
  const listHeight = useRef<number | null>(null);
  const applyHeight = () => {
    if (scroller.current && listHeight.current != null)
      scroller.current.style.setProperty('--list-height', `${listHeight.current}px`);
  };
  const scrollerRef = useCallback((el: HTMLElement | Window | null) => {
    scroller.current = el instanceof HTMLElement ? el : null;
    applyHeight();
  }, []);
  const totalListHeightChanged = useCallback((height: number) => {
    listHeight.current = height;
    applyHeight();
  }, []);

  // Ask for more once the last drawn row is within the threshold of the end, once per length of
  // the list. A page's callback changes every render, so the latest one is kept in a ref.
  const onEnd = useRef(onEndReached);
  useEffect(() => {
    onEnd.current = onEndReached;
  });
  const lastDrawn = useRef(-1);
  const askedAt = useRef(-1);
  const checkEnd = useCallback(() => {
    const last = lastDrawn.current;
    if (!onEnd.current || itemCount === 0 || last < 0) return;
    if (last >= itemCount - 1 - endReachedThreshold && askedAt.current !== itemCount) {
      askedAt.current = itemCount;
      onEnd.current();
    }
  }, [itemCount, endReachedThreshold]);
  // a longer list may still end within the threshold without the drawn range changing
  useEffect(checkEnd, [checkEnd]);

  // in development, say when the list draws every row because nothing gave it a height to fill
  const warned = useRef(false);
  const rangeChanged = useCallback(
    ({ startIndex, endIndex }: ListRange) => {
      lastDrawn.current = endIndex;
      checkEnd();
      const drawn = endIndex - startIndex + 1;
      const el = scroller.current;
      if (!import.meta.env.DEV || warned.current || drawn < UNBOUNDED_ROWS || !el) return;
      if (el.scrollHeight > el.clientHeight + 1) return;
      warned.current = true;
      console.warn(unboundedWarning('TaskList', drawn));
    },
    [checkEnd],
  );

  function setFocused(id: string) {
    setFocusedState(id);
    onFocusedIdChange?.(id);
  }

  function focusTask(id: string) {
    setFocused(id);
    const index = indexOfId(id);
    if (index < 0) return;
    // scrollIntoView scrolls only as far as it takes, like TanStack's align: 'auto'
    virtuoso.current?.scrollIntoView({ index: itemIndexOf[index] });
    const row = rows.current.get(id);
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

  const count = entries.filter((e) => e.kind === 'task' && selected.has(e.id)).length;
  const context: ListContext = {
    entries,
    rowIndexes,
    focusedId,
    selected,
    selecting: selecting ?? count > 0,
    states,
    menuOpenAt,
    subtasks,
    stack,
    bar: selectionBar && count > 0 && (
      <SelectionBar
        count={count}
        floating={floatingBar}
        data-floating={floatingBar ? '' : undefined}
        className={styles.bar}
        more={selectionMenu}
        onClear={() => setSelected(new Set())}
      />
    ),
    registerRow,
    setFocusedRowDrawn,
    setFocused,
    toggle,
    onStatusChange,
    onOpen,
  };

  // Virtuoso puts these on its scroller, which is the grid
  const root = {
    ...props,
    role: 'grid',
    'aria-multiselectable': true,
    'aria-rowcount': rowCount ?? (rowIndexes[rowIndexes.length - 1] || 0),
    tabIndex: focusedRowDrawn || !focusedId ? undefined : 0,
    className: cn(styles.list, className),
    style: { height: `var(--list-height, ${SIZE['row-height']}px)`, ...style },
    onKeyDown: handleKeyDown,
    onFocus: handleFocus,
    scrollerRef,
    context,
    components,
    computeItemKey: keyOf,
    defaultItemHeight: SIZE['row-height'],
    increaseViewportBy: OVERSCAN,
    rangeChanged,
    totalListHeightChanged,
  };

  return groups ? (
    <GroupedVirtuoso<unknown, ListContext>
      {...root}
      ref={virtuoso as RefObject<GroupedVirtuosoHandle>}
      groupCounts={groupCounts}
      groupContent={noContent}
      itemContent={noContent}
    />
  ) : (
    <Virtuoso<unknown, ListContext>
      {...root}
      ref={virtuoso as RefObject<VirtuosoHandle>}
      totalCount={entries.length}
      itemContent={noContent}
    />
  );
}
