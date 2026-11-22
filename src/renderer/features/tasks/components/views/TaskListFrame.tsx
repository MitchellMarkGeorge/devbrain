import { useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import type { TaskListItem, TaskTreeItem } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  TaskList,
  type TaskListGroup,
  type TaskListHandle,
} from '@renderer/components';
import { KeyScope, useCommands, useListCommands } from '@renderer/keyboard';
import { parentsIn, subtasksShown, visibleRows, withSubtrees } from '../../lib/tree';
import { subtreeQuery } from '../../api/queries';
import type { TaskListInput } from '../../api/search';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { TaskMenuItems } from '../menus/TaskMenus';
import { TasksSelectionBar } from './TasksSelectionBar';
import { useTaskActions } from '../../hooks/use-task-actions';
import styles from './TasksView.module.css';

/** A group of the group view: its rows as core's tree, and the input they were read with. */
export interface TaskListFrameGroup extends Omit<TaskListGroup, 'tasks'> {
  tasks: TaskTreeItem[];
  input: TaskListInput;
}

export interface TaskListFrameProps {
  /** a flat list's rows, as core's tree (`tasks.tree`), and the input they were read with */
  tasks?: TaskTreeItem[];
  input?: TaskListInput;
  /** a grouped list's groups */
  groups?: TaskListFrameGroup[];
  /** the list's total, when known */
  rowCount?: number;
  onEndReached?: () => void;
  /** whether rows and cards show their project pill (see `TasksView`) */
  showProjectPill: boolean;
}

// the data of each expanded subtree's query; a function outside the component, so React Query
// keeps the combined result the same between renders while no query's data changes
const subtreeData = (results: readonly { data?: TaskTreeItem[] }[]) =>
  results.map((result) => result.data);

/**
 * A `TaskList` as the tasks pages mount it: in a `list` key scope with the list keys (open,
 * status, favorite, trash, on the selection or the focused row), the row's right-click menu, and
 * the selection bar over its bottom. Status changes from a row are optimistic.
 *
 * Its rows are core's tree, each subtask under its parent. A parent shows or hides its subtasks
 * (its count, → / ←, its menu); a root core sent alone, with more subtasks than come inline,
 * starts hidden and loads them (`tasks.subtree`) once shown.
 */
export function TaskListFrame({
  tasks,
  input,
  groups,
  rowCount,
  onEndReached,
  showProjectPill,
}: TaskListFrameProps) {
  const list = useRef<TaskListHandle>(null);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const [selected, setSelected] = useState<string[]>([]);
  // the task whose row was right-clicked: the menu is drawn for it
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  // what the user chose for each parent: its subtasks shown or hidden (`subtasksShown`)
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const setShown = (id: string, shown: boolean) =>
    setChosen((current) => new Map(current).set(id, shown));

  // each list's rows and the input they were read with: the flat list, or each group
  const lists = useMemo(
    () =>
      groups
        ? groups.map((group) => ({ rows: group.tasks, input: group.input }))
        : [{ rows: tasks ?? [], input: input ?? {} }],
    [tasks, input, groups],
  );
  // the roots sent alone that are shown, each with its list's input: their subtrees load. Kept
  // the same between renders until the lists or the choices change, so `subtrees` is too
  const expanded = useMemo(
    () =>
      lists.flatMap((list) =>
        list.rows
          .filter((row) => row.subtreeSize !== null && chosen.get(row.id) === true)
          .map((row) => ({ id: row.id, input: list.input })),
      ),
    [lists, chosen],
  );
  // one query per expanded root, in `expanded`'s order; undefined while one loads
  const loadedSubtrees = useQueries({
    queries: expanded.map((root) => subtreeQuery(root.id as TaskId, root.input)),
    combine: subtreeData,
  });
  // each expanded root's loaded rows, by its id
  const subtrees = useMemo(
    () =>
      new Map(
        expanded.flatMap((root, i) => {
          const rows = loadedSubtrees[i];
          return rows ? [[root.id as string, rows] as const] : [];
        }),
      ),
    [expanded, loadedSubtrees],
  );

  // each list with its loaded subtrees in place, then the rows a reader sees
  const trees = useMemo(
    () => lists.map((list) => withSubtrees(list.rows, subtrees)),
    [lists, subtrees],
  );
  // The choices of parents no longer in any list (filtered out, trashed, in a subtree folded away)
  // are dropped once the rows change, so one doesn't come back if that parent shows up again.
  // Adjusted while rendering, as React suggests for state that follows props, not in an effect.
  const [prunedFor, setPrunedFor] = useState(trees);
  if (prunedFor !== trees) {
    setPrunedFor(trees);
    const present = new Set(trees.flat().map((row) => row.id as string));
    if ([...chosen.keys()].some((id) => !present.has(id))) {
      setChosen(new Map([...chosen].filter(([id]) => present.has(id))));
    }
  }
  const parents = useMemo(() => new Set(trees.flatMap((rows) => [...parentsIn(rows)])), [trees]);
  const byId = useMemo(
    () => new Map(trees.flat().map((task) => [task.id as string, task])),
    [trees],
  );
  const shownRows = useMemo(() => trees.map((rows) => visibleRows(rows, chosen)), [trees, chosen]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  const shownOf = (id: string) => {
    const row = byId.get(id);
    return row && parents.has(id) ? subtasksShown(row, chosen) : undefined;
  };
  const clearAfter = (moved: boolean) => {
    if (moved) setSelected([]);
  };

  useListCommands(list, {
    open: (task) => openEntity({ id: task.id }),
    setStatus: (rows, status) => actions.setStatus(full(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => {
      actions.trash(full(rows)).then(clearAfter);
    },
  });

  // → shows the focused row's subtasks under it, ← hides them
  const focusedParent = () => {
    const task = list.current?.focusedItem();
    return task && parents.has(task.id) ? task.id : undefined;
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
    showProject: showProjectPill,
    rowCount,
    onEndReached,
    selected,
    onSelectedChange: setSelected,
    selectionBar: false,
    nested: true,
    subtasksShown: (task: { id: string }) => shownOf(task.id),
    onSubtasksShownChange: (task: { id: string }, shown: boolean) => setShown(task.id, shown),
    onStatusChange: (task: { id: string }, status: Parameters<typeof actions.setStatus>[1]) =>
      actions.setStatus(full([task]), status),
    onOpen: (task: { id: string }) => openEntity({ id: task.id }),
    onDueDateChange: (task: { id: string }, date: Date) => actions.setDueDate(full([task]), date),
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div className={styles.region} />}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
          const task = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
          setMenuTask(task);
          if (!task) event.preventDefault();
        }}
      >
        {/* the bar is outside the list's key scope: keys on its buttons (↵ on Clear) are theirs */}
        <KeyScope name="list" render={<div className={styles.region} />}>
          {groups ? (
            <TaskList
              {...common}
              groups={groups.map((group, i) => ({ ...group, tasks: shownRows[i] }))}
              selecting={selected.length > 0}
            />
          ) : (
            <TaskList {...common} tasks={shownRows[0]} />
          )}
        </KeyScope>
        <TasksSelectionBar
          tasks={full(selected.map((id) => ({ id })))}
          actions={actions}
          onClear={() => {
            setSelected([]);
            // the bar is going: focus back to the list's focused row
            list.current?.moveFocus(0);
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuTask && (
          <TaskMenuItems
            task={byId.get(menuTask.id) ?? menuTask}
            actions={actions}
            onOpen={() => openEntity({ id: menuTask.id })}
            subtasks={
              parents.has(menuTask.id)
                ? {
                    shown: shownOf(menuTask.id) ?? false,
                    onToggle: () => setShown(menuTask.id, !shownOf(menuTask.id)),
                  }
                : undefined
            }
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
