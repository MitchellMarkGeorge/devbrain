import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { TaskStatus, type Task, type TaskListItem } from '@common/types';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DetailSection,
  ProgressRing,
  TaskList,
  TaskRowSkeleton,
  type TaskListHandle,
} from '@renderer/components';
import { KeyScope, useListCommands } from '@renderer/keyboard';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { isSynced, subtasksQuery } from '../../api/queries';
import { TaskMenuItems } from '../menus/TaskMenus';
import { useCreateTask } from '../../hooks/use-create-task';
import { useTaskActions } from '../../hooks/use-task-actions';

export interface TaskSubtasksSectionProps {
  /** the parent task, as `tasks.get` returns it */
  task: Pick<Task, 'id' | 'title' | 'status' | 'external'>;
  /** the board's task sheet: the sheet's spacing, and the rows flush with the sheet */
  compact?: boolean;
}

/**
 * A task's Subtasks: the done/total over a `TaskList` of its direct subtasks (`tasks.subtasks`,
 * paged), each changing status at once, opening on click, with the row menu on right-click and
 * the list keys; "+ Add" opens Create subtask. A synced task's subtasks come from its provider, so
 * it has no "+ Add". With no subtasks and nothing to add, the section is left out.
 */
export function TaskSubtasksSection({ task, compact = true }: TaskSubtasksSectionProps) {
  const query = useInfiniteQuery(subtasksQuery(task.id));
  // a subtask list item names no parent: the parent is this page
  const subtasks = useMemo<TaskListItem[]>(
    () =>
      query.data?.pages.flatMap((page) =>
        page.items.map((item) => ({ ...item, parentTask: null })),
      ) ?? [],
    [query.data],
  );
  const byId = useMemo(() => new Map(subtasks.map((s) => [s.id as string, s])), [subtasks]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  const list = useRef<TaskListHandle>(null);
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const canAdd = !isSynced(task);

  useListCommands(list, {
    open: (row) => openEntity({ id: row.id }),
    setStatus: (rows, status) => actions.setStatus(full(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => void actions.trash(full(rows)),
  });

  const done = subtasks.filter((s) => s.status === TaskStatus.COMPLETED).length;
  if (query.isSuccess && subtasks.length === 0 && !canAdd) return null;

  return (
    <DetailSection
      spacing={compact ? 'sheet' : 'page'}
      title="Subtasks"
      glyph={
        subtasks.length > 0 ? (
          <ProgressRing value={done} total={subtasks.length} size={12} />
        ) : undefined
      }
      count={subtasks.length > 0 ? `${done}/${subtasks.length}` : undefined}
      action={
        canAdd && (
          <Button
            size="xs"
            icon={Plus}
            onClick={() =>
              createTask({ parent: { id: task.id, title: task.title, status: task.status } })
            }
          >
            Add
          </Button>
        )
      }
    >
      {query.isPending ? (
        <TaskRowSkeleton />
      ) : (
        subtasks.length > 0 && (
          <ContextMenu>
            <ContextMenuTrigger
              style={{ display: 'contents' }}
              onContextMenu={(event) => {
                const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
                const found = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
                setMenuTask(found);
                if (!found) event.preventDefault();
              }}
            >
              <KeyScope name="list">
                <TaskList
                  compact={compact}
                  ref={list}
                  // in the sheet's narrow column a subtask shows its title, priority and date:
                  // its project and link are mostly the parent's
                  tasks={
                    compact
                      ? subtasks.map((row) => ({ ...row, project: null, link: null }))
                      : subtasks
                  }
                  selectionBar={false}
                  // the rows' selection strip hangs into the page margin, so the status icons
                  // line up with the column, as Figma's page draws them
                  onEndReached={() => {
                    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
                  }}
                  onStatusChange={(row, status) => actions.setStatus(full([row]), status)}
                  onDueDateChange={(row, date) => actions.setDueDate(full([row]), date)}
                  onOpen={(row) => openEntity({ id: row.id })}
                />
              </KeyScope>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {menuTask && (
                <TaskMenuItems
                  task={byId.get(menuTask.id) ?? menuTask}
                  actions={actions}
                  onOpen={() => openEntity({ id: menuTask.id })}
                />
              )}
            </ContextMenuContent>
          </ContextMenu>
        )
      )}
    </DetailSection>
  );
}
