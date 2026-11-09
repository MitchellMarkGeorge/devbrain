import { useMemo, useRef, useState } from 'react';
import type { TaskListItem } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  TaskList,
  type TaskListGroup,
  type TaskListHandle,
} from '../../components';
import { KeyScope, useCommands, useListCommands } from '../../keyboard';
import { arrangeSubtasks, hasPlacedSubtasks } from './arrange';
import { useOpenEntity } from '../app/use-open-entity';
import { TaskMenuItems } from './TaskMenus';
import { TasksSelectionBar } from './TasksSelectionBar';
import { useTaskActions } from './use-task-actions';
import styles from './TasksView.module.css';

export interface TaskListFrameProps {
  /** every task loaded, for the commands and menus to find a row's task by id */
  loaded: readonly TaskListItem[];
  /** a flat list's rows */
  tasks?: TaskListItem[];
  /** a grouped list's groups */
  groups?: TaskListGroup[];
  /** the list's total, when known */
  rowCount?: number;
  onEndReached?: () => void;
}

/**
 * A `TaskList` as the tasks pages mount it: in a `list` key scope with the list keys (open,
 * status, favorite, trash, on the selection or the focused row), the row's right-click menu, and
 * the selection bar over its bottom. Status changes from a row are optimistic.
 */
export function TaskListFrame({
  loaded,
  tasks,
  groups,
  rowCount,
  onEndReached,
}: TaskListFrameProps) {
  const list = useRef<TaskListHandle>(null);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const [selected, setSelected] = useState<string[]>([]);
  // the task whose row was right-clicked: the menu is drawn for it
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const byId = useMemo(() => new Map(loaded.map((task) => [task.id as string, task])), [loaded]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  // parents whose subtasks are hidden; every parent shows its subtasks under it at first
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const setShown = (id: string, shown: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (shown) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = useMemo(() => tasks && arrangeSubtasks(tasks, collapsed), [tasks, collapsed]);
  const grouped = useMemo(
    () =>
      groups?.map((group) => ({
        ...group,
        tasks: arrangeSubtasks(group.tasks as TaskListItem[], collapsed),
      })),
    [groups, collapsed],
  );
  const clearAfter = (moved: boolean) => {
    if (moved) setSelected([]);
  };

  useListCommands(list, {
    open: (task) => openEntity({ id: task.id }),
    setStatus: (rows, status) => actions.setStatus(full(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => void actions.trash(full(rows)).then(clearAfter),
  });

  // → shows the focused row's subtasks under it, ← hides them
  const focusedParent = () => {
    const task = list.current?.focusedItem();
    return task && hasPlacedSubtasks(task as TaskListItem, loaded) ? task.id : undefined;
  };
  useCommands([
    {
      id: 'row.expand',
      title: 'Show subtasks',
      scope: 'list',
      run: () => {
        const id = focusedParent();
        if (id) setShown(id, true);
      },
      enabled: () => focusedParent() !== undefined,
    },
    {
      id: 'row.collapse',
      title: 'Hide subtasks',
      scope: 'list',
      run: () => {
        const id = focusedParent();
        if (id) setShown(id, false);
      },
      enabled: () => focusedParent() !== undefined,
    },
  ]);

  const common = {
    ref: list,
    rowCount,
    onEndReached,
    selected,
    onSelectedChange: setSelected,
    selectionBar: false,
    onStatusChange: (task: { id: string }, status: Parameters<typeof actions.setStatus>[1]) =>
      actions.setStatus(full([task]), status),
    onOpen: (task: { id: string }) => openEntity({ id: task.id }),
    onDueDateChange: (task: { id: string }, date: Date) => actions.setDueDate(full([task]), date),
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        style={{ display: 'contents' }}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
          const task = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
          setMenuTask(task);
          if (!task) event.preventDefault();
        }}
      >
        <KeyScope name="list" render={<div className={styles.region} />}>
          {groups ? (
            <TaskList {...common} groups={grouped ?? []} selecting={selected.length > 0} />
          ) : (
            <TaskList {...common} tasks={rows ?? []} />
          )}
          <TasksSelectionBar
            tasks={full(selected.map((id) => ({ id })))}
            actions={actions}
            onClear={() => setSelected([])}
          />
        </KeyScope>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuTask && (
          <TaskMenuItems
            task={byId.get(menuTask.id) ?? menuTask}
            actions={actions}
            onOpen={() => openEntity({ id: menuTask.id })}
            subtasks={
              hasPlacedSubtasks(menuTask, loaded)
                ? {
                    shown: !collapsed.has(menuTask.id),
                    onToggle: () => setShown(menuTask.id, collapsed.has(menuTask.id)),
                  }
                : undefined
            }
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
