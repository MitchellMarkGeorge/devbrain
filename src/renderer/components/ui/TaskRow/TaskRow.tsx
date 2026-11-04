import {
  Children,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Badge } from '../Badge';
import { Checkbox } from '../Checkbox';
import { EntityPill } from '../EntityPill';
import { PriorityIcon } from '../PriorityIcon';
import { ProgressRing } from '../ProgressRing';
import { SourcePill } from '../SourcePill';
import { StatusIcon } from '../StatusIcon';
import { StatusMenu, type PickableStatus } from '../StatusMenu';
import { TASK_STATUS_LABELS, type TaskStatus } from '../types';
import type { Task } from './types';
import styles from './TaskRow.module.css';

export const taskRowVariants = cva(styles.row, {
  variants: {
    /** indented under its parent */
    subtask: { true: styles.subtask },
  },
});

export interface TaskRowProps extends Omit<ComponentProps<'div'>, 'onSelect' | 'children'> {
  task: Task;
  /** the row is selected (falls back to `task.selected`) */
  selected?: boolean;
  /** something in the list is selected: every row shows its checkbox */
  selecting?: boolean;
  /** joins a selected row to the selected row above or below into one block */
  joinPrev?: boolean;
  joinNext?: boolean;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
  subtask?: boolean;
  /**
   * How the pills stack when the row runs out of room. `auto` (the default) measures the row:
   * first the pills after the title stack, then the key with the subtask or parent pill, and the
   * title shortens only after that. `none`, `right` and `both` pin a level, for pictures of the
   * row. A side with one pill never stacks.
   */
  stack?: StackMode;
  /** the status, when controlled; otherwise the row keeps `task.status` and its own changes */
  status?: TaskStatus;
  onStatusChange?: (status: PickableStatus) => void;
  /** the status menu is open (controlled), or open at first (`defaultMenuOpen`) */
  menuOpen?: boolean;
  defaultMenuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** toggles the row's selection (the checkbox, or `X` on the focused row) */
  onSelect?: () => void;
  /** opens the task (a click on the row, or Enter) */
  onOpen?: () => void;
}

/** The status the icon shows: overdue (the flag) until the task is started or done. */
export function shownStatus(status: TaskStatus, dateTone: Task['dateTone']): TaskStatus {
  if (status === 'completed' || status === 'cancelled') return status;
  if (dateTone === 'overdue' && status !== 'in-progress') return 'overdue';
  return status;
}

export type StackMode = 'auto' | 'none' | 'right' | 'both';

// how far the pills are stacked: 0 none, 1 the right side, 2 both sides
type StackLevel = 0 | 1 | 2;
const LEVELS: Record<Exclude<StackMode, 'auto'>, StackLevel> = { none: 0, right: 1, both: 2 };

// a stacked pill shows this much of its edge (its icon) behind the next one
const STACK_EDGE = 26;
// the gap between spread pills (--space-1-5)
const STACK_GAP = 6;

// how far a spread deck may reach left: just before the title, never over the status icon
const DECK_LEFT_SLACK = 8;

/**
 * The pills on one side of the title, stacked like a deck when the row runs out of room: the last
 * in full, the ones behind showing their edge and icon. Pointing at the stack or focusing it
 * spreads it out on top of the row, over the end of the title, without moving anything.
 */
function PillStack({ stacked, children }: { stacked: boolean; children: ReactNode }) {
  const pills = Children.toArray(children);
  const ref = useRef<HTMLSpanElement>(null);
  const deckRef = useRef<HTMLSpanElement>(null);
  // the stacked width, kept while the deck is spread so the row does not reflow
  const [spreadFrom, setSpreadFrom] = useState<number | null>(null);
  // the spread deck grows leftwards from the stack's right edge; when that would run past the
  // start of the title it shifts right instead, over the pills on the right
  // when shifted over the other side's stack, the deck's ground runs on to that stack's end so
  // none of it peeks out from under the deck
  const [cover, setCover] = useState({ shift: 0, pad: 0 });
  const isStacked = stacked && pills.length > 1;
  const spreadOut = isStacked && spreadFrom != null;

  useLayoutEffect(() => {
    const stack = ref.current;
    const deck = deckRef.current;
    const row = stack?.closest('[role="row"]');
    const title = row?.querySelector('[data-title]');
    if (!spreadOut || !stack || !deck || !row || !title) {
      setCover({ shift: 0, pad: 0 });
      return;
    }
    const minLeft = title.getBoundingClientRect().left - DECK_LEFT_SLACK;
    const stackRight = stack.getBoundingClientRect().right;
    const shift = Math.max(0, minLeft - (stackRight - deck.offsetWidth));
    let pad = 0;
    if (shift > 0) {
      const deckRight = stackRight + shift;
      for (const other of row.querySelectorAll('[data-stack]')) {
        const box = other.getBoundingClientRect();
        if (other !== stack && box.left < deckRight && box.right > deckRight) {
          pad = box.right - deckRight;
        }
      }
    }
    setCover({ shift, pad });
  }, [spreadOut]);

  if (pills.length === 0) return null;

  function spread() {
    if (isStacked && spreadFrom == null && ref.current) setSpreadFrom(ref.current.offsetWidth);
  }
  function close() {
    setSpreadFrom(null);
  }
  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  }

  return (
    <span
      ref={ref}
      className={styles.stack}
      data-stack=""
      data-stacked={isStacked ? '' : undefined}
      data-spread={spreadOut ? '' : undefined}
      style={spreadOut ? { width: spreadFrom } : undefined}
      onPointerEnter={spread}
      onPointerLeave={close}
      onFocus={spread}
      onBlur={handleBlur}
    >
      <span
        ref={deckRef}
        className={styles.deck}
        data-shifted={cover.shift ? '' : undefined}
        style={
          cover.shift
            ? { right: -cover.shift - cover.pad, paddingRight: cover.pad || undefined }
            : undefined
        }
      >
        {pills}
      </span>
    </span>
  );
}

// the width a stack saves by stacking: each pill behind shrinks from its own width to the edge
function stackSavings(stack: Element | null): number {
  const deck = stack?.firstElementChild;
  if (!deck || deck.children.length < 2) return 0;
  const pills = Array.from(deck.children) as HTMLElement[];
  let saved = 0;
  for (const pill of pills.slice(0, -1)) {
    // scrollWidth is the pill's own width even while it is cut to its edge (+2 for its border)
    saved += pill.scrollWidth + 2 + STACK_GAP - STACK_EDGE;
  }
  return saved;
}

/**
 * The stack level that fits the row: stack a side when the title is cut short, unstack one when
 * the room beside the title covers what stacking it saved.
 */
function useAutoStack(
  enabled: boolean,
  rowRef: RefObject<HTMLDivElement | null>,
  canStack: { left: boolean; right: boolean },
): StackLevel {
  const [level, setLevel] = useState<StackLevel>(0);
  const maxLevel: StackLevel = canStack.left ? 2 : canStack.right ? 1 : 0;

  const fit = useCallback(() => {
    const row = rowRef.current;
    if (!enabled || !row || row.querySelector('[data-spread]')) return;
    const title = row.querySelector<HTMLElement>('[data-title]');
    const name = title?.querySelector<HTMLElement>('[data-name]');
    if (!title || !name) return;
    const leftStack = title.querySelector<HTMLElement>('[data-stack]');
    const rightStack = row.querySelector<HTMLElement>('[data-side] [data-stack]');

    setLevel((current) => {
      const cut = name.scrollWidth > name.clientWidth + 0.5;
      if (cut && current < maxLevel) {
        // skip a level that changes nothing (a right side with one pill)
        return current === 0 && !canStack.right ? 2 : ((current + 1) as StackLevel);
      }
      if (!cut && current > 0) {
        // the title's gap (10px) sits between the name and its pills
        const leftWidth = leftStack ? leftStack.offsetWidth + 10 : 0;
        const room = title.clientWidth - name.scrollWidth - leftWidth;
        const saved = stackSavings(current === 2 ? leftStack : rightStack);
        if (room >= saved + 1) {
          return current === 2 && !canStack.right ? 0 : ((current - 1) as StackLevel);
        }
      }
      return current;
    });
  }, [enabled, rowRef, maxLevel, canStack.right]);

  // fit again after every change of level, and whenever the row changes size
  useLayoutEffect(fit, [fit, level]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!enabled || !row) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(row);
    return () => observer.disconnect();
  }, [enabled, rowRef, fit]);

  return Math.min(level, maxLevel) as StackLevel;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T }).current = value;
}

// clicks on the row's own controls (checkbox, status, pills) don't open the task
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  const control = (event.target as Element).closest('button, a, [role="checkbox"], input');
  return control != null && control !== event.currentTarget;
}

/**
 * One task in a strokeless list: the status button (opening the `StatusMenu`), the title, its
 * source, parent and subtask pills, then entity pills, priority and the date on the right. Use it
 * inside `TaskList`, which handles selection and keyboard movement.
 *
 * Keyboard on the focused row: `S` opens the status menu (then `1`, `2`, `3`), `X` toggles
 * selection, Enter opens the task.
 */
export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  {
    task,
    selected: selectedProp,
    selecting,
    joinPrev,
    joinNext,
    state,
    subtask,
    stack,
    status: statusProp,
    onStatusChange,
    menuOpen: menuOpenProp,
    defaultMenuOpen = false,
    onMenuOpenChange,
    onSelect,
    onOpen,
    className,
    onKeyDown,
    onClick,
    ...props
  },
  ref,
) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  const leftPills = [task.key, task.parent, task.subtasks].filter(Boolean).length;
  const rightPills = [task.project, task.event, task.note].filter(Boolean).length;
  const autoLevel = useAutoStack(stack === 'auto' || stack === undefined, rowRef, {
    left: leftPills > 1,
    right: rightPills > 1,
  });
  const level = stack === undefined || stack === 'auto' ? autoLevel : LEVELS[stack];

  const [statusState, setStatusState] = useState(task.status);
  const status = statusProp ?? statusState;
  const [menuOpenState, setMenuOpenState] = useState(defaultMenuOpen);
  const menuOpen = menuOpenProp ?? menuOpenState;
  const selected = selectedProp ?? !!task.selected;
  const completed = status === 'completed';
  const shown = shownStatus(status, task.dateTone);

  function setMenuOpen(open: boolean) {
    setMenuOpenState(open);
    onMenuOpenChange?.(open);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      setMenuOpen(true);
    } else if (key === 'x' && onSelect) {
      event.preventDefault();
      onSelect();
    } else if (event.key === 'Enter' && onOpen) {
      event.preventDefault();
      onOpen();
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && onOpen && !fromControl(event)) onOpen();
  }

  return (
    <div
      ref={setRowRef}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? '' : undefined}
      data-selecting={selecting ? '' : undefined}
      data-join-prev={joinPrev ? '' : undefined}
      data-join-next={joinNext ? '' : undefined}
      data-state={state}
      data-completed={completed ? '' : undefined}
      data-menu-open={menuOpen ? '' : undefined}
      className={cn(taskRowVariants({ subtask }), className)}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      {...props}
    >
      <Checkbox
        className={styles.check}
        checked={selected}
        onCheckedChange={() => onSelect?.()}
        tabIndex={-1}
        aria-label={`Select ${task.title}`}
      />
      <StatusMenu
        status={status}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onStatusChange={(picked) => {
          setStatusState(picked);
          onStatusChange?.(picked);
        }}
        trigger={
          <button
            type="button"
            className={styles.status}
            tabIndex={-1}
            aria-label={`Status: ${TASK_STATUS_LABELS[shown]}`}
          >
            <StatusIcon status={shown} />
          </button>
        }
      />
      <div className={styles.title} data-title="">
        <span className={styles.name} data-name="">
          {task.title}
        </span>
        <PillStack stacked={level === 2}>
          {task.key && <SourcePill provider={task.source}>{task.key}</SourcePill>}
          {task.parent && (
            <EntityPill type="parent" status={task.parentStatus}>
              {task.parent}
            </EntityPill>
          )}
          {task.subtasks && (
            <Badge
              muted
              icon={<ProgressRing value={task.subtasks[0]} total={task.subtasks[1]} size={12} />}
            >
              {task.subtasks[0]}/{task.subtasks[1]}
            </Badge>
          )}
        </PillStack>
      </div>
      <div className={styles.side} data-side="">
        <PillStack stacked={level >= 1}>
          {task.project && (
            <EntityPill type="project" color={task.projectColor}>
              {task.project}
            </EntityPill>
          )}
          {task.event && (
            <EntityPill type="event" color={task.eventColor}>
              {task.event}
            </EntityPill>
          )}
          {task.note && <EntityPill type="note">{task.note}</EntityPill>}
        </PillStack>
        <span className={styles.priority}>
          {!completed && <PriorityIcon priority={task.priority} />}
        </span>
        <span
          className={cn(
            styles.date,
            !completed && task.dateTone === 'today' && styles.today,
            !completed && task.dateTone === 'overdue' && styles.overdue,
          )}
        >
          {task.date}
        </span>
      </div>
    </div>
  );
});
