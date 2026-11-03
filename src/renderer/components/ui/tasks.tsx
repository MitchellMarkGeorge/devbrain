import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import { Button, Checkbox, Icon, PriorityIcon, ProgressRing, StatusIcon } from './primitives';
import { EntityPill, SourcePill } from './content';
import { DropdownMenu } from './overlays';
import { Calendar } from './controls';
import { ui } from './styles';
import type { Task as ReferenceTask, TaskStatus, Priority } from './types';
export interface Task extends ReferenceTask {
  id?: string;
}
const statuses: { value: TaskStatus; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];
export interface StatusMenuProps {
  status: TaskStatus;
  onPick?: (status: TaskStatus) => void;
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export function StatusMenu({
  status,
  onPick,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
}: StatusMenuProps) {
  const [internal, setInternal] = useState(defaultOpen ?? false);
  const change = (next: boolean) => {
    setInternal(next);
    onOpenChange?.(next);
  };
  const isOpen = open ?? internal;
  useEffect(() => {
    if (!isOpen) return;
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.matches('input, textarea, [contenteditable]'))
      )
        return;
      const item = statuses[Number(event.key) - 1];
      if (item) {
        event.preventDefault();
        event.stopPropagation();
        onPick?.(item.value);
        setInternal(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  }, [isOpen, onPick, onOpenChange]);
  function pick(next: TaskStatus) {
    onPick?.(next);
    change(false);
  }
  return (
    <Menu.Root open={open ?? internal} onOpenChange={change}>
      <Menu.Trigger
        render={
          trigger ?? (
            <button type="button" className={ui('dbl-status')} aria-label="Change status">
              <StatusIcon status={status} />
            </button>
          )
        }
      />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className={ui('positioner')}>
          <Menu.Popup
            aria-label="Status"
            className={ui('db-menu', 'popup')}
            onKeyDown={(event) => {
              const item = statuses[Number(event.key) - 1];
              if (item) {
                event.preventDefault();
                pick(item.value);
              }
            }}
          >
            <Menu.Group>
              <Menu.GroupLabel className={ui('db-menu-label')}>Status</Menu.GroupLabel>
              <Menu.RadioGroup value={status}>
                {statuses.map((item, index) => (
                  <Menu.RadioItem
                    key={item.value}
                    value={item.value}
                    className={ui('db-menu-item')}
                    onClick={() => pick(item.value)}
                  >
                    <StatusIcon status={item.value} />
                    <span>{item.label}</span>
                    <span className={ui('db-menu-shortcut')}>
                      {status === item.value ? <Icon name="check" size={12} /> : index + 1}
                    </span>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export interface SelectionBarProps {
  count: number;
  onClear?: () => void;
  floating?: boolean;
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: Priority) => void;
  onDueDateChange?: (date: Date | undefined) => void;
  onMove?: () => void;
  moreActions?: Parameters<typeof DropdownMenu>[0]['items'];
}
export function SelectionBar({
  count,
  onClear,
  floating = true,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onMove,
  moreActions,
}: SelectionBarProps) {
  if (!count) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selected task actions"
      className={ui('dbl-selbar', !floating && 'dbl-static')}
    >
      <span className={ui('dbl-selcount')} aria-live="polite">
        {count} selected
      </span>
      <span className={ui('dbl-selsep')} />
      <StatusMenu
        status="not-started"
        onPick={onStatusChange}
        trigger={
          <Button variant="ghost" icon="circle">
            Status
          </Button>
        }
      />
      <DropdownMenu
        trigger={
          <Button variant="ghost" icon="equal">
            Priority
          </Button>
        }
        items={(['high', 'medium', 'low'] as const).map((priority) => ({
          label: priority[0].toUpperCase() + priority.slice(1),
          icon: <PriorityIcon priority={priority} />,
          onClick: () => onPriorityChange?.(priority),
        }))}
      />
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button variant="ghost" icon="calendar">
              Due date
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className={ui('positioner')}>
            <Popover.Popup className={ui('db-popover', 'date-picker')}>
              <Calendar onSelect={onDueDateChange} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Button variant="ghost" icon="folder-input" onClick={onMove}>
        Move
      </Button>
      {moreActions && <DropdownMenu items={moreActions} />}
      <Button variant="ghost" size="icon" icon="x" aria-label="Clear selection" onClick={onClear} />
    </div>
  );
}
export interface TaskRowProps {
  task: Task;
  selected?: boolean;
  joinPrev?: boolean;
  joinNext?: boolean;
  state?: 'hover' | 'focus';
  menuOpen?: boolean;
  subtask?: boolean;
  stack?: 'right' | 'both';
  status?: TaskStatus;
  onSelect?: () => void;
  onStatusChange?: (status: TaskStatus) => void;
  onOpen?: () => void;
  onEntityClick?: (type: string, label: string) => void;
  tabIndex?: number;
}
export function TaskRow({
  task,
  selected = task.selected,
  joinPrev,
  joinNext,
  state,
  menuOpen,
  subtask,
  stack,
  status = task.status,
  onSelect,
  onStatusChange,
  onOpen,
  onEntityClick,
  tabIndex = 0,
}: TaskRowProps) {
  const [open, setOpen] = useState(menuOpen ?? false);
  const done = status === 'completed';
  const entity = (type: 'project' | 'event' | 'note' | 'parent', label: string, color?: string) => (
    <EntityPill type={type} color={color} onClick={() => onEntityClick?.(type, label)}>
      {label}
    </EntityPill>
  );
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      onSelect?.();
    }
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      setOpen(true);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onOpen?.();
    }
  }
  return (
    <div
      role="row"
      aria-selected={!!selected}
      aria-label={task.title}
      data-task-row
      tabIndex={tabIndex}
      className={ui('dbl-row', subtask && 'dbl-sub')}
      data-selected={selected ? '' : undefined}
      data-join-prev={joinPrev ? '' : undefined}
      data-join-next={joinNext ? '' : undefined}
      data-completed={done ? '' : undefined}
      data-state={state}
      data-menu-open={open ? '' : undefined}
      onKeyDown={keyboard}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, input, a')) onOpen?.();
      }}
    >
      <div role="gridcell" className={ui('dbl-check')}>
        <Checkbox
          checked={!!selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${task.title}`}
        />
      </div>
      <div role="gridcell">
        <StatusMenu
          status={status}
          open={open}
          onOpenChange={setOpen}
          onPick={onStatusChange}
          trigger={
            <button
              type="button"
              className={ui('dbl-status')}
              aria-label={`Change status of ${task.title}`}
            >
              <StatusIcon status={status} />
            </button>
          }
        />
      </div>
      <div role="gridcell" className={ui('dbl-title')}>
        <span className={ui('dbl-name')} title={task.title}>
          {task.title}
        </span>
        <span className={ui('dbl-stack')} data-stacked={stack === 'both' ? '' : undefined}>
          {task.key && (
            <SourcePill provider={task.source} onClick={() => onEntityClick?.('source', task.key!)}>
              {task.key}
            </SourcePill>
          )}
          {task.parent && !subtask && entity('parent', task.parent)}
          {task.subtasks && (
            <EntityPill
              icon={<ProgressRing value={task.subtasks[0]} total={task.subtasks[1]} size={12} />}
              onClick={onOpen}
            >
              {task.subtasks.join('/')}
            </EntityPill>
          )}
        </span>
      </div>
      <div role="gridcell" className={ui('dbl-side')}>
        <span className={ui('dbl-stack')} data-stacked={stack ? '' : undefined}>
          {task.project && entity('project', task.project, task.projectColor)}
          {task.event && entity('event', task.event, task.eventColor)}
          {task.note && entity('note', task.note)}
        </span>
        {!done && (
          <span className={ui('dbl-pri')}>
            <PriorityIcon priority={task.priority} />
          </span>
        )}
        {task.date && (
          <span className={ui('db-date')} data-tone={task.dateTone}>
            {task.date}
          </span>
        )}
      </div>
    </div>
  );
}
export interface TaskListProps {
  tasks: Task[];
  defaultSelected?: number[];
  selected?: number[];
  onSelectionChange?: (selected: number[]) => void;
  states?: Record<number, 'hover' | 'focus'>;
  menuOpenAt?: number;
  subtasks?: boolean;
  selectionBar?: boolean;
  floatingBar?: boolean;
  stack?: 'right' | 'both';
  density?: 'default' | 'compact';
  onOpenTask?: (task: Task, index: number) => void;
  onTaskChange?: (task: Task, index: number) => void;
  onEntityClick?: TaskRowProps['onEntityClick'];
  onMove?: (tasks: Task[]) => void;
  /** Full date value for persistence; Task.date remains a formatted presentation string. */
  onDueDateChange?: (date: Date | undefined, tasks: Task[]) => void;
  label?: string;
}
export function TaskList({
  tasks,
  defaultSelected = [],
  selected,
  onSelectionChange,
  states,
  menuOpenAt,
  subtasks,
  selectionBar = true,
  floatingBar = true,
  stack,
  density = 'default',
  onOpenTask,
  onTaskChange,
  onEntityClick,
  onMove,
  onDueDateChange,
  label = 'Tasks',
}: TaskListProps) {
  const [internal, setInternal] = useState(defaultSelected);
  const [overrides, setOverrides] = useState<
    Record<string, { source: Task; patch: Partial<Task> }>
  >({});
  const root = useRef<HTMLDivElement>(null);
  const selection = (selected ?? internal).filter((index) => index >= 0 && index < tasks.length);
  const key = (task: Task, index: number) => task.id ?? String(index);
  const current = (task: Task, index: number) => {
    const override = overrides[key(task, index)];
    return override?.source === task ? { ...task, ...override.patch } : task;
  };
  const changeSelection = (next: number[]) => {
    setInternal(next);
    onSelectionChange?.(next);
  };
  function patchTask(task: Task, index: number, patch: Partial<Task>) {
    setOverrides((previous) => ({
      ...previous,
      [key(task, index)]: {
        source: task,
        patch: {
          ...(previous[key(task, index)]?.source === task ? previous[key(task, index)].patch : {}),
          ...patch,
        },
      },
    }));
    onTaskChange?.({ ...current(task, index), ...patch }, index);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.matches('[data-task-row]')) return;
    const rows = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-task-row]') ?? []);
    const index = rows.indexOf(target);
    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (offset) {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, index + offset))]?.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
      event.preventDefault();
      changeSelection(tasks.map((_, i) => i));
    }
    if (event.key === 'Escape') changeSelection([]);
  }
  return (
    <div
      ref={root}
      className={ui('dbl-list')}
      data-selecting={selection.length ? '' : undefined}
      data-density={density}
      onKeyDown={keyboard}
    >
      <div role="grid" aria-label={label} aria-multiselectable="true">
        {tasks.map((task, index) => (
          <TaskRow
            key={key(task, index)}
            task={current(task, index)}
            selected={selection.includes(index)}
            joinPrev={selection.includes(index) && selection.includes(index - 1)}
            joinNext={selection.includes(index) && selection.includes(index + 1)}
            state={states?.[index]}
            menuOpen={menuOpenAt === index}
            subtask={subtasks}
            stack={stack}
            onSelect={() =>
              changeSelection(
                selection.includes(index)
                  ? selection.filter((i) => i !== index)
                  : [...selection, index],
              )
            }
            onStatusChange={(status) => patchTask(task, index, { status })}
            onOpen={() => onOpenTask?.(current(task, index), index)}
            onEntityClick={onEntityClick}
          />
        ))}
      </div>
      {!tasks.length && <p className={ui('empty-message')}>No tasks yet.</p>}
      {selectionBar && (
        <SelectionBar
          count={selection.length}
          floating={floatingBar}
          onClear={() => changeSelection([])}
          onStatusChange={(status) =>
            selection.forEach((index) => patchTask(tasks[index], index, { status }))
          }
          onPriorityChange={(priority) =>
            selection.forEach((index) => patchTask(tasks[index], index, { priority }))
          }
          onDueDateChange={(date) => {
            onDueDateChange?.(
              date,
              selection.map((index) => current(tasks[index], index)),
            );
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const day = date && new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const dateTone =
              day && day.getTime() === today.getTime()
                ? 'today'
                : day && day < today
                  ? 'overdue'
                  : undefined;
            selection.forEach((index) =>
              patchTask(tasks[index], index, {
                date: date?.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
                dateTone,
              }),
            );
          }}
          onMove={() => onMove?.(selection.map((index) => current(tasks[index], index)))}
        />
      )}
    </div>
  );
}
export interface BoardColumnProps {
  name: string;
  status: TaskStatus;
  count?: number;
  add?: boolean;
  children?: ReactNode;
  onAdd?: () => void;
}
export function BoardColumn({
  name,
  status,
  count,
  add = status !== 'completed',
  children,
  onAdd,
}: BoardColumnProps) {
  return (
    <section aria-label={name} className={ui('dbl-col')}>
      <header className={ui('dbl-colhead')}>
        <StatusIcon status={status} />
        <span>{name}</span>
        {count !== undefined && <span className={ui('dbl-colcount')}>{count}</span>}
        {add && (
          <Button
            variant="ghost"
            size="icon-xs"
            icon="plus"
            aria-label={`Add task to ${name}`}
            onClick={onAdd}
          />
        )}
      </header>
      <div className={ui('dbl-cards')}>{children}</div>
      {add && (
        <button type="button" className={ui('dbl-slot')} onClick={onAdd}>
          <Icon name="plus" />
          Add task
        </button>
      )}
    </section>
  );
}
export function BoardCard({
  task,
  state,
  onOpen,
  onEntityClick,
}: {
  task: Task;
  state?: 'hover' | 'focus';
  onOpen?: () => void;
  onEntityClick?: TaskRowProps['onEntityClick'];
}) {
  return (
    <article
      className={ui('dbl-card')}
      data-state={state}
      data-completed={task.status === 'completed' ? '' : undefined}
    >
      {(task.event || task.note || task.key) && (
        <div className={ui('dbl-ctop')}>
          {(task.event || task.note) && (
            <button
              type="button"
              className={ui('text-button', 'dbl-clink')}
              onClick={() =>
                onEntityClick?.(task.event ? 'event' : 'note', task.event ?? task.note!)
              }
            >
              {task.event ? (
                <Icon name="calendar" size={12} color={task.eventColor} />
              ) : (
                <Icon name="file-text" size={12} />
              )}
              <span>{task.event ?? task.note}</span>
            </button>
          )}
          {task.key && (
            <SourcePill
              compact
              provider={task.source}
              onClick={() => onEntityClick?.('source', task.key!)}
            >
              {task.key}
            </SourcePill>
          )}
        </div>
      )}
      <button
        type="button"
        className={ui('text-button', 'dbl-ctitle', 'board-title')}
        onClick={onOpen}
      >
        {task.title}
      </button>
      <div className={ui('dbl-cmeta')}>
        {task.status !== 'completed' && <PriorityIcon priority={task.priority} size={12} />}
        {task.subtasks && (
          <span className={ui('dbl-subs')}>
            <ProgressRing value={task.subtasks[0]} total={task.subtasks[1]} size={12} />
            {task.subtasks.join('/')}
          </span>
        )}
        {task.project && (
          <button
            type="button"
            className={ui('text-button', 'dbl-cproj')}
            onClick={() => onEntityClick?.('project', task.project!)}
          >
            <Icon name="folder" size={12} color={task.projectColor} />
            <span>{task.project}</span>
          </button>
        )}
        {task.date && (
          <span className={ui('db-date')} data-tone={task.dateTone}>
            {task.date}
          </span>
        )}
      </div>
    </article>
  );
}
