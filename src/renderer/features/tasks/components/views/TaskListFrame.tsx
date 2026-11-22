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
import { useMap } from '@renderer/shared/hooks/use-map';
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

// the rows of each expanded root's subtree query, undefined while one loads; a function outside
// the component, so React Query keeps the combined result the same while no query's data changes
const subtreeRowsOf = (results: readonly { data?: TaskTreeItem[] }[]) =>
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
  const listRef = useRef<TaskListHandle>(null);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // the task whose row was right-clicked: the context menu is drawn for it
  const [contextMenuTask, setContextMenuTask] = useState<TaskListItem | null>(null);
  // what the user chose for each parent, by id: its subtasks shown (true) or hidden (false). A
  // parent with no entry has its default (`subtasksShown`)
  const {
    map: subtaskChoices,
    set: setSubtasksShown,
    retain: retainSubtaskChoices,
  } = useMap<string, boolean>();

  // each list as core sent it, with the input it was read with: the flat list, or each group
  const listsFromCore = useMemo(
    () =>
      groups
        ? groups.map((group) => ({ rows: group.tasks, input: group.input }))
        : [{ rows: tasks ?? [], input: input ?? {} }],
    [tasks, input, groups],
  );
  // the roots sent alone (too many subtasks to come inline) that the user has shown, each with
  // its list's input: their subtrees load. The same array until the lists or the choices change,
  // so the queries below and `subtreesByRootId` are too
  const expandedBigRoots = useMemo(
    () =>
      listsFromCore.flatMap((list) =>
        list.rows
          .filter((row) => row.subtreeSize !== null && subtaskChoices.get(row.id) === true)
          .map((row) => ({ id: row.id, input: list.input })),
      ),
    [listsFromCore, subtaskChoices],
  );
  // one query per expanded big root, in `expandedBigRoots`' order
  const loadedSubtreeRows = useQueries({
    queries: expandedBigRoots.map((root) => subtreeQuery(root.id as TaskId, root.input)),
    combine: subtreeRowsOf,
  });
  // each expanded big root's loaded rows, by its id; a root whose rows are loading has none
  const subtreesByRootId = useMemo(
    () =>
      new Map(
        expandedBigRoots.flatMap((root, i) => {
          const rows = loadedSubtreeRows[i];
          return rows ? [[root.id as string, rows] as const] : [];
        }),
      ),
    [expandedBigRoots, loadedSubtreeRows],
  );

  // each list with its loaded subtrees placed under their roots: every row the frame knows of
  const fullLists = useMemo(
    () => listsFromCore.map((list) => withSubtrees(list.rows, subtreesByRootId)),
    [listsFromCore, subtreesByRootId],
  );
  // The choices of parents no longer in any list (filtered out, trashed, in a subtree folded away)
  // are dropped once the rows change, so one doesn't come back if that parent shows up again.
  // Adjusted while rendering, as React suggests for state that follows props, not in an effect.
  const [choicesPrunedFor, setChoicesPrunedFor] = useState(fullLists);
  if (choicesPrunedFor !== fullLists) {
    setChoicesPrunedFor(fullLists);
    const listedIds = new Set(fullLists.flat().map((row) => row.id as string));
    retainSubtaskChoices((id) => listedIds.has(id));
  }
  // the rows that can show or hide subtasks: those with subtasks right below, and big roots
  const parentIds = useMemo(
    () => new Set(fullLists.flatMap((rows) => [...parentsIn(rows)])),
    [fullLists],
  );
  const rowsById = useMemo(
    () => new Map(fullLists.flat().map((task) => [task.id as string, task])),
    [fullLists],
  );
  // each list as drawn: every row but those under a parent whose subtasks are hidden
  const visibleLists = useMemo(
    () => fullLists.map((rows) => visibleRows(rows, subtaskChoices)),
    [fullLists, subtaskChoices],
  );

  // the listed rows of these tasks, as the actions and the menu take them
  const taskRowsFor = (items: readonly { id: string }[]) =>
    items.flatMap((item) => rowsById.get(item.id) ?? []);
  // whether a parent's subtasks are shown; undefined for a row with none to show or hide
  const subtasksShownFor = (id: string) => {
    const row = rowsById.get(id);
    return row && parentIds.has(id) ? subtasksShown(row, subtaskChoices) : undefined;
  };
  const clearSelectionIfTrashed = (trashed: boolean) => {
    if (trashed) setSelectedIds([]);
  };

  useListCommands(listRef, {
    open: (task) => openEntity({ id: task.id }),
    setStatus: (rows, status) => actions.setStatus(taskRowsFor(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(taskRowsFor(rows)),
    trash: (rows) => {
      actions.trash(taskRowsFor(rows)).then(clearSelectionIfTrashed);
    },
  });

  // → shows the focused row's subtasks under it, ← hides them
  const focusedParentId = () => {
    const task = listRef.current?.focusedItem();
    return task && parentIds.has(task.id) ? task.id : undefined;
  };
  useCommands([
    {
      id: 'row.expand',
      title: 'Show subtasks',
      scope: 'list',
      run: () => {
        const id = focusedParentId();
        if (id) setSubtasksShown(id, true);
      },
      enabled: () => focusedParentId() !== undefined,
    },
    {
      id: 'row.collapse',
      title: 'Hide subtasks',
      scope: 'list',
      run: () => {
        const id = focusedParentId();
        if (id) setSubtasksShown(id, false);
      },
      enabled: () => focusedParentId() !== undefined,
    },
  ]);

  // the props the flat and the grouped list share
  const sharedListProps = {
    ref: listRef,
    showProject: showProjectPill,
    rowCount,
    onEndReached,
    selected: selectedIds,
    onSelectedChange: setSelectedIds,
    selectionBar: false,
    nested: true,
    subtasksShown: (task: { id: string }) => subtasksShownFor(task.id),
    onSubtasksShownChange: (task: { id: string }, shown: boolean) =>
      setSubtasksShown(task.id, shown),
    onStatusChange: (task: { id: string }, status: Parameters<typeof actions.setStatus>[1]) =>
      actions.setStatus(taskRowsFor([task]), status),
    onOpen: (task: { id: string }) => openEntity({ id: task.id }),
    onDueDateChange: (task: { id: string }, date: Date) =>
      actions.setDueDate(taskRowsFor([task]), date),
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div className={styles.region} />}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
          const task = row ? (rowsById.get(row.dataset.taskId ?? '') ?? null) : null;
          setContextMenuTask(task);
          if (!task) event.preventDefault();
        }}
      >
        {/* the bar is outside the list's key scope: keys on its buttons (↵ on Clear) are theirs */}
        <KeyScope name="list" render={<div className={styles.region} />}>
          {groups ? (
            <TaskList
              {...sharedListProps}
              groups={groups.map((group, i) => ({ ...group, tasks: visibleLists[i] }))}
              selecting={selectedIds.length > 0}
            />
          ) : (
            <TaskList {...sharedListProps} tasks={visibleLists[0]} />
          )}
        </KeyScope>
        <TasksSelectionBar
          tasks={taskRowsFor(selectedIds.map((id) => ({ id })))}
          actions={actions}
          onClear={() => {
            setSelectedIds([]);
            // the bar is going: focus back to the list's focused row
            listRef.current?.moveFocus(0);
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        {contextMenuTask && (
          <TaskMenuItems
            task={rowsById.get(contextMenuTask.id) ?? contextMenuTask}
            actions={actions}
            onOpen={() => openEntity({ id: contextMenuTask.id })}
            subtasks={
              parentIds.has(contextMenuTask.id)
                ? {
                    shown: subtasksShownFor(contextMenuTask.id) ?? false,
                    onToggle: () =>
                      setSubtasksShown(contextMenuTask.id, !subtasksShownFor(contextMenuTask.id)),
                  }
                : undefined
            }
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
