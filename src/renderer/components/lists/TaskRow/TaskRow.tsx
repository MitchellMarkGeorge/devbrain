import {
  Children,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { cva } from 'class-variance-authority';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../../ui/Badge';
import { Checkbox } from '../../ui/Checkbox';
import { EntityPill } from '../../entities/EntityPill';
import { linkTarget, PillHoverCard, subtasksTarget } from '../../entities/EntityHoverCard';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { SourcePill } from '../../entities/SourcePill';
import { StatusIcon } from '../../entities/StatusIcon';
import { StatusMenu, type PickableStatus } from '../../entities/StatusMenu';
import { LinkState, TaskStatus } from '@common/types';
import { SetDueDateButton } from '../../entities/SetDueDateButton';
import { useFormat } from '../../lib/format';
import {
  dueTone,
  isClosed,
  isSynced,
  NO_DATE_LABEL,
  isDetached,
  providerOf,
  TASK_STATUS_LABELS,
} from '../../types';
import type { TaskRowData } from './types';
import type { TaskRowTree } from './tree';
import styles from './TaskRow.module.css';

export const taskRowVariants = cva(styles.row, {
  variants: {
    /** Home: 44px, with no selection strip */
    compact: { true: styles.compact },
  },
});

export interface TaskRowProps extends Omit<ComponentProps<'div'>, 'onSelect' | 'children'> {
  /** core's task as it is: a `TaskListItem` */
  task: TaskRowData;
  /** the row is selected */
  selected?: boolean;
  /** something in the list is selected: every row shows its checkbox */
  selecting?: boolean;
  /** joins a selected row to the selected row above or below into one block */
  joinPrev?: boolean;
  joinNext?: boolean;
  /** a static hover or focus, for pictures of the row */
  state?: 'hover' | 'focus';
  /**
   * where the row sits among subtasks drawn under their parents (`TaskList`'s `nested`): indented
   * by its depth, with guide lines from its parent's status icon to its own
   */
  tree?: TaskRowTree;
  /**
   * whether the task's subtasks are drawn under it, with `onSubtasksShownChange`: its subtask count
   * becomes the button that shows and hides them, with a chevron (down while shown, right while
   * hidden). Left out, the count is a plain pill.
   */
  subtasksShown?: boolean;
  onSubtasksShownChange?: (shown: boolean) => void;
  /**
   * Home's tasks: a 44px row with no selection strip and no checkbox, the status icon 12px in.
   * Home has no selection, so leave out `onSelect`.
   */
  compact?: boolean;
  /**
   * How the pills stack (overlapping, labels shortened) when the row runs out of room; pointing at
   * a pill spreads them back out over the end of the title. `auto` (the
   * default) measures the row: first the pills after the title stack, then the key with the subtask or parent pill, and the
   * title shortens only after that. `none`, `right` and `both` pin a level, for pictures of the
   * row. A side with one pill never stacks.
   */
  stack?: StackMode;
  /**
   * shows the task's project pill (the default). A list of one project's tasks (that project's
   * page) passes `false`: the pill would say the same thing on every row.
   */
  showProject?: boolean;
  /**
   * shows a subtask's parent pill (the default). A task's own Subtasks section passes `false`: the
   * parent is the task it is on. A row drawn under its parent in a tree leaves it off either way.
   */
  showParent?: boolean;
  /**
   * shows the task's linked event or note pill (the default). The task sheet's narrow Subtasks
   * section passes `false`: a subtask shares its parent's link, which the sheet already shows.
   */
  showLink?: boolean;
  /** the status, when controlled; otherwise the row shows its own pick until `task.status` changes */
  status?: TaskStatus;
  onStatusChange?: (status: PickableStatus) => void;
  /** the status menu is open (controlled), or open at first (`defaultMenuOpen`) */
  menuOpen?: boolean;
  defaultMenuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** toggles the row's selection (the checkbox) */
  onSelect?: () => void;
  /** opens the task (a click on the row) */
  onOpen?: () => void;
  /**
   * sets a due date on a task without one: its blank date slot shows "Set due date" while the row
   * is pointed at or focused. Left out (or for a closed or synced task), the slot stays blank.
   */
  onDueDateChange?: (date: Date) => void;
}

export type StackMode = 'auto' | 'none' | 'right' | 'both';

// how far the pills are stacked: 0 none, 1 the right side, 2 both sides
type StackLevel = 0 | 1 | 2;
const LEVELS: Record<Exclude<StackMode, 'auto'>, StackLevel> = { none: 0, right: 1, both: 2 };

// stacked pills overlap by this much, each over the one before (--space-1)
const STACK_OVERLAP = 4;
// the gap between pills that are not stacked (--space-1-5)
const STACK_GAP = 6;
// a pill's widest: 240px (Badge's cap), or 140px while stacked
const PILL_MAX = 240;
const STACKED_PILL_MAX = 140;
// a pill shortened to its icon: its border, padding and 12px icon (TaskRow.module.css's 34px)
const PILL_ICON_WIDTH = 34;
// how far the title gives way while the row's stacks are spread (pointed at)
const SPREAD_NAME_MIN = 40;

/**
 * The pills on one side of the title. Stacked, when the row runs out of room, they overlap a
 * little, each pill over the one before, and each is capped at 140px with its label shortened.
 * Pointing at a pill (or focusing one) spreads every stack in the row back out, full labels and all,
 * over the end of the title, which gives way down to a word or two (TaskRow.module.css).
 */
function PillStack({ stacked, children }: { stacked: boolean; children: ReactNode }) {
  const pills = Children.toArray(children);
  if (pills.length === 0) return null;
  return (
    <span
      className={styles.stack}
      data-stack=""
      data-stacked={stacked && pills.length > 1 ? '' : undefined}
      // stacked, the stack narrows no further than every pill's icon
      style={{ ['--pills' as string]: pills.length }}
    >
      {pills}
    </span>
  );
}

/**
 * A pill's full width, the same however it is drawn: capped, shortened to its icon in a stack, or
 * mid-animation. Its own scroll width counts the parts that run past its edge, and each part that
 * clips its own text (the label, shortened to an ellipsis) adds what it hides. Measuring the pill
 * as drawn would loop: a shortened pill measures narrow, the row unstacks, and it measures wide.
 */
function pillWidth(pill: Element, max: number): number {
  let hidden = 0;
  for (const part of pill.querySelectorAll('*')) {
    hidden += Math.max(0, part.scrollWidth - part.clientWidth);
  }
  return Math.min(pill.scrollWidth + 2 + hidden, max);
}

// a stack's width with its pills apart and stacked, from their full widths
function stackWidths(stack: Element | null): { spread: number; stacked: number; floor: number } {
  const pills = Array.from(stack?.children ?? []);
  if (pills.length === 0) return { spread: 0, stacked: 0, floor: 0 };
  const sum = (max: number) => pills.reduce((total, pill) => total + pillWidth(pill, max), 0);
  return {
    // spread with nothing pointed at, as narrow as it goes: the key and the subtask count
    // (`data-keep`) whole, every other pill at its icon
    floor:
      pills.reduce(
        (total, pill) =>
          total + (pill.hasAttribute('data-keep') ? pillWidth(pill, PILL_MAX) : PILL_ICON_WIDTH),
        0,
      ) +
      STACK_GAP * (pills.length - 1),
    spread: sum(PILL_MAX) + STACK_GAP * (pills.length - 1),
    stacked:
      pills.length > 1 ? sum(STACKED_PILL_MAX) - STACK_OVERLAP * (pills.length - 1) : sum(PILL_MAX),
  };
}

function gapOf(element: Element): number {
  return parseFloat(getComputedStyle(element).columnGap) || 0;
}

/**
 * The stack level that fits the row (and, for any row, how its stacks share the room when spread):
 * the first of none, right, both at which the title's full text
 * fits beside the pills. It works from full widths (the title's text, each pill, the priority and
 * the date), never from the row as it is drawn, so it gives the same answer while the pills are
 * animating between levels.
 */
function useAutoStack(
  enabled: boolean,
  rowRef: RefObject<HTMLDivElement | null>,
  canStack: { left: boolean; right: boolean },
): StackLevel {
  const [level, setLevel] = useState<StackLevel>(0);

  const fit = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const title = row.querySelector<HTMLElement>('[data-title]');
    const name = title?.querySelector<HTMLElement>('[data-name]');
    const side = row.querySelector<HTMLElement>('[data-side]');
    if (!title || !name || !side) return;
    const left = stackWidths(title.querySelector('[data-stack]'));
    const rightStack = side.querySelector('[data-stack]');
    const right = stackWidths(rightStack);

    // the room from the start of the title to the row's right padding
    const rowBox = row.getBoundingClientRect();
    const paddingRight = parseFloat(getComputedStyle(row).paddingRight) || 0;
    const room = rowBox.right - paddingRight - title.getBoundingClientRect().left;
    // the side's own parts (priority, date) and the gaps between everything
    const sideParts = Array.from(side.children).filter((child) => child !== rightStack);
    const sideFixed =
      sideParts.reduce((sum, part) => sum + (part as HTMLElement).offsetWidth, 0) +
      gapOf(side) * (side.children.length - 1);
    const titleGap = left.spread ? gapOf(title) : 0;

    // Spread (the row pointed at), the title gives way down to SPREAD_NAME_MIN and the two stacks
    // share what is left between it and the priority, each in proportion to its full width: the
    // title's cell is held at the title's floor and the stack before it's share, and the side
    // takes the rest. Written straight onto the row: it changes nothing React draws.
    const budget = Math.max(0, room - SPREAD_NAME_MIN - titleGap - gapOf(row) - sideFixed);
    const pills = left.spread + right.spread;
    // never less than either stack's floor, so no pill spills out of its stack
    const share = pills <= budget ? left.spread : (budget * left.spread) / pills;
    const leftShare = Math.max(left.floor, Math.min(share, budget - right.floor));
    row.style.setProperty('--spread-name-min', `${SPREAD_NAME_MIN}px`);
    row.style.setProperty('--spread-title-min', `${SPREAD_NAME_MIN + titleGap + leftShare}px`);

    if (!enabled) return;
    const fixed = name.scrollWidth + gapOf(row) + sideFixed + titleGap;
    const fits = (l: StackLevel) =>
      fixed + (l >= 1 ? right.stacked : right.spread) + (l === 2 ? left.stacked : left.spread) <=
      room + 0.5;
    const levels: StackLevel[] = [0];
    if (canStack.right) levels.push(1);
    if (canStack.left) levels.push(2);
    setLevel(levels.find(fits) ?? levels[levels.length - 1]);
  }, [enabled, rowRef, canStack.left, canStack.right]);

  // fit on every render (the task may have changed), when the row changes size, and once the
  // fonts have loaded (the title's width changes with them)
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(row);
    document.fonts?.ready.then(() => fit());
    return () => observer.disconnect();
  }, [rowRef, fit]);

  return level;
}

/**
 * Spreads the row's stacks (`data-spread`, which TaskRow.module.css draws) once the pointer reaches
 * a pill, or focus does, and keeps them spread until the pointer leaves the row and focus leaves its
 * pills. Pointing at the rest of the row only tints it. Kept till the row is left rather than the
 * stack: spread, the pills move as the title gives way, and a pointer left just outside them would
 * fold them back under it, and spread them again. Set on the element, not by a render: nothing
 * React draws changes.
 */
function useSpreadOnPills(rowRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const onPill = (target: EventTarget | null) =>
      target instanceof Element && target.closest('[data-stack]') != null;
    const spread = () => row.setAttribute('data-spread', '');
    const fold = () => row.removeAttribute('data-spread');
    const pointerOver = (event: PointerEvent) => {
      if (onPill(event.target)) spread();
    };
    const pointerLeave = () => {
      if (!row.querySelector('[data-stack] :focus-visible')) fold();
    };
    const focusIn = (event: FocusEvent) => {
      if (onPill(event.target)) spread();
    };
    const focusOut = (event: FocusEvent) => {
      if (!onPill(event.relatedTarget) && !row.matches(':hover')) fold();
    };
    row.addEventListener('pointerover', pointerOver);
    row.addEventListener('pointerleave', pointerLeave);
    row.addEventListener('focusin', focusIn);
    row.addEventListener('focusout', focusOut);
    return () => {
      row.removeEventListener('pointerover', pointerOver);
      row.removeEventListener('pointerleave', pointerLeave);
      row.removeEventListener('focusin', focusIn);
      row.removeEventListener('focusout', focusOut);
    };
  }, [rowRef]);
}

/**
 * The lines joining a nested row to its parents: one per cell of its prefix (`tree.cells`), at that
 * level's line (the centre of the status icon of the ancestor at that level), and a stem down from
 * its own status icon when its subtasks are drawn under it. The lines never overlap: the border
 * colour is translucent, so an overlap would draw darker.
 */
function TreeGuides({ tree }: { tree: TaskRowTree }) {
  const at = (level: number) => ({ ['--level' as string]: level }) as CSSProperties;
  return (
    <span className={styles.guides} aria-hidden>
      {tree.cells.map((cell, level) =>
        cell === 'none' ? null : <span key={level} className={styles[cell]} style={at(level)} />,
      )}
      {tree.open && <span className={styles.stem} style={at(tree.depth)} />}
    </span>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T }).current = value;
}

// clicks on the row's own controls (checkbox, status, pills) don't open the task
function fromControl(event: MouseEvent<HTMLElement>): boolean {
  // a click in something the row opened (its status menu, a date picker, its context menu):
  // portalled elsewhere in the page, but React still bubbles it up to the row
  if (!event.currentTarget.contains(event.target as Node)) return true;
  const control = (event.target as Element).closest('button, a, [role="checkbox"], input');
  return control != null && control !== event.currentTarget;
}

/**
 * One task in a strokeless list, drawn from core's `TaskListItem`: the status button (opening the
 * `StatusMenu`), the title, its key, parent
 * and subtask pills, then the linked event or note and the project, priority and the due date
 * (always the date, "Jul 1" or "Dec 2025", from `useFormat()`'s `formatListDate`; colour
 * says when it is today or overdue) on the right. Use it inside `TaskList`, which handles
 * selection and focus.
 *
 * It binds no keys: the app's keymap opens its status menu (`menuOpen`), selects it (`onSelect`)
 * and opens it (`onOpen`) through `TaskList`.
 */
export const TaskRow = forwardRef<HTMLDivElement, TaskRowProps>(function TaskRow(
  {
    task,
    selected: selectedProp,
    selecting,
    joinPrev,
    joinNext,
    state,
    tree,
    subtasksShown,
    onSubtasksShownChange,
    compact,
    stack,
    showProject = true,
    showParent = true,
    showLink = true,
    status: statusProp,
    onStatusChange,
    menuOpen: menuOpenProp,
    defaultMenuOpen = false,
    onMenuOpenChange,
    onSelect,
    onOpen,
    onDueDateChange,
    className,
    style,
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
  const { now, formatListDate } = useFormat();
  const synced = isSynced(task);
  const key = task.external?.key;
  const subtasks = task.subtaskProgress;
  // a subtask drawn under its parent leaves out the parent's pill: the guide points at the parent
  const parent = !showParent || (tree && tree.depth > 0) ? null : task.parentTask;
  const leftPills = [key, parent, subtasks].filter(Boolean).length;
  const project = showProject ? task.project : null;
  const link = showLink ? task.link : null;
  const rightPills = [link, project].filter(Boolean).length;
  const autoLevel = useAutoStack(stack === 'auto' || stack === undefined, rowRef, {
    left: leftPills > 1,
    right: rightPills > 1,
  });
  const level = stack === undefined || stack === 'auto' ? autoLevel : LEVELS[stack];
  useSpreadOnPills(rowRef);
  // The row draws its first level without motion; changes after that animate. The flag is set on
  // the element after the first frame and never by a render, so React leaves it alone.
  useEffect(() => {
    const frame = requestAnimationFrame(() => rowRef.current?.setAttribute('data-settled', ''));
    return () => cancelAnimationFrame(frame);
  }, []);

  // a pick made on the row shows until core's status changes (the refetch after the write)
  const [picked, setPicked] = useState<{ from: TaskStatus; to: TaskStatus } | null>(null);
  const status = statusProp ?? (picked && picked.from === task.status ? picked.to : task.status);
  const [menuOpenState, setMenuOpenState] = useState(defaultMenuOpen);
  const menuOpen = menuOpenProp ?? menuOpenState;
  const selected = !!selectedProp;
  const completed = status === TaskStatus.COMPLETED;
  const tone = dueTone(status, task.dueDate, now);

  function setMenuOpen(open: boolean) {
    setMenuOpenState(open);
    onMenuOpenChange?.(open);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && onOpen && !fromControl(event)) onOpen();
  }

  const statusIcon = <StatusIcon status={status} />;

  // a synced task's status is its provider's: the icon alone, in the button's place
  const taskStatus = synced ? (
    <span className={styles.status} data-readonly="">
      {statusIcon}
    </span>
  ) : (
    <StatusMenu
      status={status}
      open={menuOpen}
      onOpenChange={setMenuOpen}
      onStatusChange={(next) => {
        setPicked({ from: task.status, to: next });
        onStatusChange?.(next);
      }}
      trigger={
        <button
          type="button"
          className={styles.status}
          tabIndex={-1}
          aria-label={`Status: ${TASK_STATUS_LABELS[status]}`}
        >
          {statusIcon}
        </button>
      }
    />
  );

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
      data-menu-open={menuOpen && !synced ? '' : undefined}
      className={cn(taskRowVariants({ compact }), tree && styles.nested, className)}
      style={tree ? { ...style, ['--depth' as string]: tree.depth } : style}
      onClick={handleClick}
      {...props}
    >
      {tree && <TreeGuides tree={tree} />}
      {!compact && (
        <Checkbox
          className={styles.check}
          checked={selected}
          onCheckedChange={() => onSelect?.()}
          tabIndex={-1}
          aria-label={`Select ${task.title}`}
        />
      )}
      {taskStatus}
      <div className={styles.title} data-title="">
        <span className={styles.name} data-name="">
          {task.title}
        </span>
        <PillStack stacked={level === 2}>
          {key && task.external && (
            <PillHoverCard target={{ type: 'source', title: task.title, external: task.external }}>
              <SourcePill
                provider={providerOf(task.external)}
                detached={isDetached(task)}
                data-keep=""
              >
                {key}
              </SourcePill>
            </PillHoverCard>
          )}
          {parent && (
            <PillHoverCard target={{ type: 'task', ...parent }}>
              <EntityPill entity={{ type: 'parent', ...parent }} />
            </PillHoverCard>
          )}
          {subtasks &&
            (subtasksShown !== undefined && onSubtasksShownChange ? (
              // the count as the show/hide button: no hover card, since the subtasks it would list
              // are the rows under it, a click away
              <Badge
                muted
                icon={<ProgressRing value={subtasks.completed} total={subtasks.total} size={12} />}
                tabIndex={-1}
                aria-expanded={subtasksShown}
                aria-label={`Subtasks, ${subtasks.completed} of ${subtasks.total} done`}
                data-subtasks-toggle=""
                data-keep=""
                onClick={() => onSubtasksShownChange(!subtasksShown)}
              >
                <span className={styles.toggle}>
                  {subtasks.completed}/{subtasks.total}
                  {subtasksShown ? (
                    <ChevronDown size={12} aria-hidden />
                  ) : (
                    <ChevronRight size={12} aria-hidden />
                  )}
                </span>
              </Badge>
            ) : (
              <PillHoverCard target={subtasksTarget(task.id, subtasks)}>
                <Badge
                  muted
                  icon={
                    <ProgressRing value={subtasks.completed} total={subtasks.total} size={12} />
                  }
                  data-keep=""
                >
                  {subtasks.completed}/{subtasks.total}
                </Badge>
              </PillHoverCard>
            ))}
        </PillStack>
      </div>
      <div className={styles.side} data-side="">
        <PillStack stacked={level >= 1}>
          {link && (
            <PillHoverCard target={linkTarget(link)}>
              <EntityPill entity={link} />
            </PillHoverCard>
          )}
          {project && (
            <PillHoverCard target={{ type: 'project', ...project }}>
              <EntityPill entity={{ type: 'project', ...project }} />
            </PillHoverCard>
          )}
        </PillStack>
        <span className={styles.priority}>
          <PriorityIcon priority={task.priority} />
        </span>
        <span
          className={cn(
            styles.date,
            tone === 'today' && styles.today,
            tone === 'overdue' && styles.overdue,
          )}
        >
          {task.dueDate ? (
            formatListDate(task.dueDate)
          ) : (
            <>
              <span className={styles.noDate}>{NO_DATE_LABEL}</span>
              {onDueDateChange &&
                !isClosed(status) &&
                task.external?.state !== LinkState.SYNCED && (
                  <SetDueDateButton className={styles.setDue} onDueDateChange={onDueDateChange} />
                )}
            </>
          )}
        </span>
      </div>
    </div>
  );
});
