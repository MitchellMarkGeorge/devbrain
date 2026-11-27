import {
  Children,
  forwardRef,
  useCallback,
  useEffect,
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
import { isFromNestedControl } from '../../lib/nested-control';
import { Badge } from '../../ui/Badge';
import { Checkbox } from '../../ui/Checkbox';
import { EntityPill, type OpenableEntity } from '../../entities/EntityPill';
import { linkTarget, PillHoverCard, subtasksTarget } from '../../entities/EntityHoverCard';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { PriorityMenu } from '../../entities/PriorityMenu';
import { ProgressRing } from '../../ui/ProgressRing';
import { SourcePill } from '../../entities/SourcePill';
import { StatusIcon } from '../../entities/StatusIcon';
import { StatusMenu, type PickableStatus } from '../../entities/StatusMenu';
import { LinkState, TaskPriority, TaskStatus, type SettablePriority } from '@common/types';
import { SetDueDateButton } from '../../entities/SetDueDateButton';
import { useFormat } from '../../lib/format';
import {
  dueTone,
  isClosed,
  isSynced,
  NO_DATE_LABEL,
  isDetached,
  PRIORITY_LABELS,
  providerOf,
  TASK_STATUS_LABELS,
} from '../../types';
import type { TaskRowData } from './types';
import type { TaskRowTree } from './tree';
import { useMeasuredFit } from './measured-fit';
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
  /**
   * sets the priority: the priority icon becomes the button that opens the `PriorityMenu`. Left
   * out (or for a synced task, whose priority is its provider's), the icon is drawn alone.
   */
  onPriorityChange?: (priority: SettablePriority) => void;
  /** the priority menu is open at first, for pictures */
  defaultPriorityMenuOpen?: boolean;
  /** toggles the row's selection (the checkbox) */
  onSelect?: () => void;
  /** opens the task (a click on the row) */
  onOpen?: () => void;
  /**
   * opens what a pill points at, given its summary: the parent task, the linked event or note, the
   * project. Left out, a click on those pills does nothing (and still doesn't open the task).
   */
  onOpenEntity?: (entity: OpenableEntity) => void;
  /**
   * sets a due date on a task without one: its blank date slot shows "Set due date" while the row
   * is pointed at or focused. Left out (or for a closed or synced task), the slot stays blank.
   */
  onDueDateChange?: (date: Date) => void;
}

/**
 * The pills on one side of the title, each in a slot. Short of room, the slots narrow and the pills
 * keep their width, so each pill slides under the one after it: a stack, the last pill on top.
 * Stacking is the row's flex layout alone (TaskRow.module.css); nothing is measured for it.
 */
function Pills({ children }: { children: ReactNode }) {
  const pills = Children.toArray(children);
  if (pills.length === 0) return null;
  return (
    <span className={styles.pills} data-pills="">
      {pills.map((pill, index) => (
        <span key={index} className={styles.slot}>
          {pill}
        </span>
      ))}
    </span>
  );
}

// the group of pills that is spread: pointed at, holding keyboard focus, or with its hover card open
const SPREAD_GROUP = '[data-pills]:is(:hover, :has(:focus-visible, [data-popup-open]))';

/**
 * Spreads a group of stacked pills while it is pointed at (or a pill in it has keyboard focus, or
 * its hover card is open): marks the row `data-spread` with the group's side (`title` or `side`),
 * which TaskRow.module.css lays out, and measures the title and every pill before and after, so
 * the stylesheet can animate each from the width it had (`--spread-from`) to the one it gets
 * (`--spread-to`) while it is marked `data-spreading`. The widths in between are a mix of two
 * layouts that both fit the row, so they fit it too, and the group grows steadily over where it
 * was: the pointer stays on it.
 *
 * All of it is set on the elements, not by a render: nothing React draws changes. The motion
 * itself (keyframes, duration, easing, none under reduced motion) is the stylesheet's.
 */
function useSpreadPills(rowRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const row = rowRef.current;
    // the measured experiment (`data-fit`) spreads its own way: see measured-fit.ts
    if (!row || row.hasAttribute('data-fit')) return;

    const sync = () => {
      const group = row.querySelector(SPREAD_GROUP);
      const next = group ? (group.closest('[data-side]') ? 'side' : 'title') : undefined;
      if (next === row.dataset.spread) return;

      // the title and each pill's slot: every part of the row whose width the spread changes
      const parts = Array.from(row.querySelectorAll<HTMLElement>('[data-name], [data-pills] > *'));
      const widths = () => parts.map((part) => part.getBoundingClientRect().width);
      // as drawn now, mid-animation included, so a change of mind carries on from where it is
      const from = widths();
      if (next) row.dataset.spread = next;
      else delete row.dataset.spread;
      // drop any animation still running, so the new layout is measured settled; marking a part
      // again after this measurement starts its animation afresh
      for (const part of parts) part.removeAttribute('data-spreading');
      const to = widths();
      parts.forEach((part, index) => {
        if (Math.abs(from[index] - to[index]) < 0.5) return;
        part.style.setProperty('--spread-from', `${from[index]}px`);
        part.style.setProperty('--spread-to', `${to[index]}px`);
        part.setAttribute('data-spreading', '');
      });
    };
    // an animation over (or dropped): the part is the layout's again
    const settle = (event: AnimationEvent) => {
      if (event.target instanceof Element) event.target.removeAttribute('data-spreading');
    };

    const events = ['pointerover', 'pointerout', 'focusin', 'focusout'] as const;
    for (const event of events) row.addEventListener(event, sync);
    row.addEventListener('animationend', settle);
    // a hover card closing (the pointer was on the card, outside the row) is no event on the row
    const cards = new MutationObserver(sync);
    cards.observe(row, { subtree: true, attributeFilter: ['data-popup-open'] });
    return () => {
      for (const event of events) row.removeEventListener(event, sync);
      row.removeEventListener('animationend', settle);
      cards.disconnect();
    };
  }, [rowRef]);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T }).current = value;
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
 *
 * A click opens it (`onOpen`) unless it lands on one of its controls (a button, link, checkbox
 * or input: the status button, its pills, "Set due date") or in something it opened and
 * portalled elsewhere (the status menu, a date picker, its context menu). Those still bubble to
 * the row and reach `onClick`, so its controls need no `stopPropagation`. An `onClick` that calls
 * `event.preventDefault()` keeps it from opening too.
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
    showProject = true,
    showParent = true,
    showLink = true,
    status: statusProp,
    onStatusChange,
    menuOpen: menuOpenProp,
    defaultMenuOpen = false,
    onMenuOpenChange,
    onPriorityChange,
    defaultPriorityMenuOpen = false,
    onSelect,
    onOpen,
    onOpenEntity,
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
  useSpreadPills(rowRef);
  useMeasuredFit(rowRef);
  const { now, formatListDate } = useFormat();
  const synced = isSynced(task);
  const key = task.external?.key;
  const subtasks = task.subtaskProgress;
  // a subtask drawn under its parent leaves out the parent's pill: the guide points at the parent
  const parent = !showParent || (tree && tree.depth > 0) ? null : task.parentTask;
  const project = showProject ? task.project : null;
  const link = showLink ? task.link : null;

  // a pick made on the row shows until core's status changes (the refetch after the write)
  const [picked, setPicked] = useState<{ from: TaskStatus; to: TaskStatus } | null>(null);
  const status = statusProp ?? (picked && picked.from === task.status ? picked.to : task.status);
  const [menuOpenState, setMenuOpenState] = useState(defaultMenuOpen);
  const menuOpen = menuOpenProp ?? menuOpenState;
  // the priority menu is the row's own: the list's keys open only the status menu. A pick shows
  // until core's priority changes, as a status pick does.
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(defaultPriorityMenuOpen);
  const [pickedPriority, setPickedPriority] = useState<{
    from: TaskPriority;
    to: TaskPriority;
  } | null>(null);
  const priority =
    pickedPriority && pickedPriority.from === task.priority ? pickedPriority.to : task.priority;
  const selected = !!selectedProp;
  const completed = status === TaskStatus.COMPLETED;
  const tone = dueTone(status, task.dueDate, now);

  function setMenuOpen(open: boolean) {
    setMenuOpenState(open);
    onMenuOpenChange?.(open);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && onOpen && !isFromNestedControl(event)) onOpen();
  }

  const statusIcon = <StatusIcon status={status} />;
  const priorityIcon = <PriorityIcon priority={priority} />;

  // a synced task's status is its provider's: the icon alone, in the button's place
  const taskStatus =
    synced || !onStatusChange ? (
      <span className={cn(styles.rowButton, styles.status)} data-readonly="">
        {statusIcon}
      </span>
    ) : (
      <StatusMenu
        status={status}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onStatusChange={(next) => {
          setPicked({ from: task.status, to: next });
          onStatusChange(next);
        }}
        trigger={
          <button
            type="button"
            className={cn(styles.rowButton, styles.status)}
            tabIndex={-1}
            aria-label={`Status: ${TASK_STATUS_LABELS[status]}`}
          >
            {statusIcon}
          </button>
        }
      />
    );

  // a synced task's priority is its provider's, and a row that can't set one draws the icon alone
  const taskPriority =
    synced || !onPriorityChange ? (
      <span className={cn(styles.rowButton, styles.priority)} data-readonly="">
        {priorityIcon}
      </span>
    ) : (
      <PriorityMenu
        priority={priority}
        open={priorityMenuOpen}
        onOpenChange={setPriorityMenuOpen}
        onPriorityChange={(next) => {
          setPickedPriority({ from: task.priority, to: next });
          onPriorityChange(next);
        }}
        trigger={
          <button
            type="button"
            className={cn(styles.rowButton, styles.priority)}
            tabIndex={-1}
            aria-label={`Priority: ${PRIORITY_LABELS[priority]}`}
          >
            {priorityIcon}
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
      data-menu-open={(menuOpen || priorityMenuOpen) && !synced ? '' : undefined}
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
      <div className={styles.content}>
        <div className={styles.title} data-title="">
          <span className={styles.name} data-name="">
            {task.title}
          </span>
          <Pills>
            {key && task.external && (
              <PillHoverCard
                target={{ type: 'source', title: task.title, external: task.external }}
              >
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
                <EntityPill
                  entity={{ type: 'parent', ...parent }}
                  onClick={onOpenEntity && (() => onOpenEntity(parent))}
                />
              </PillHoverCard>
            )}
            {subtasks &&
              (subtasksShown !== undefined && onSubtasksShownChange ? (
                // the count as the show/hide button: no hover card, since the subtasks it would list
                // are the rows under it, a click away
                <Badge
                  muted
                  icon={
                    <ProgressRing value={subtasks.completed} total={subtasks.total} size={12} />
                  }
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
          </Pills>
        </div>
        <div className={styles.side} data-side="">
          <Pills>
            {link && (
              <PillHoverCard target={linkTarget(link)}>
                <EntityPill entity={link} onClick={onOpenEntity && (() => onOpenEntity(link))} />
              </PillHoverCard>
            )}
            {project && (
              <PillHoverCard target={{ type: 'project', ...project }}>
                <EntityPill
                  entity={{ type: 'project', ...project }}
                  onClick={onOpenEntity && (() => onOpenEntity(project))}
                />
              </PillHoverCard>
            )}
          </Pills>
        </div>
      </div>
      <span className={styles.meta}>
        {taskPriority}
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
      </span>
    </div>
  );
});
