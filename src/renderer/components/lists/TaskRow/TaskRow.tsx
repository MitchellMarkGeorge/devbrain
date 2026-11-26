import {
  Children,
  forwardRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
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

/**
 * The pills on one side of the title. They never overlap and never move: when the row runs out of
 * room the title shortens first, then the pills with a name (the parent, the link, the project)
 * shorten their labels, down to their icons, while the key and the subtask count (`data-keep`)
 * stay whole. All of it is the row's flex layout (TaskRow.module.css); nothing is measured.
 */
function Pills({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <span className={styles.pills} data-pills="">
      {children}
    </span>
  );
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
      ref={ref}
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
        <Pills>
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
        </Pills>
      </div>
      <div className={styles.side} data-side="">
        <Pills>
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
        </Pills>
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
