import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { TaskStatus, type Project, type TaskListItem } from '@common/types';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DetailSection,
  StatusIcon,
  TaskList,
  TaskRowSkeleton,
  type TaskListHandle,
} from '../../../components';
import { KeyScope, useListCommands } from '../../../keyboard';
import { useOpenEntity } from '../../app/use-open-entity';
import { useCreateTask } from '../../tasks/create/use-create-task';
import { TaskMenuItems } from '../../tasks/menus/TaskMenus';
import { isSynced, withoutProjectPill } from '../../tasks/queries';
import { useTaskActions } from '../../tasks/use-task-actions';
import { OVERVIEW_SECTION_SIZE, overviewTasksQuery } from '../queries';
import styles from './ProjectPage.module.css';

export interface OverviewTaskSectionProps {
  project: Project;
  status: TaskStatus;
  title: string;
  /** how many tasks of this status the project has, from its stats */
  count: number;
  /** opens the Tasks tab on this status, for the tasks the section leaves out */
  onShowAll: () => void;
  /** folded away at first (Completed) */
  collapsed?: boolean;
}

/**
 * One of the Overview's sections (In progress, Up next, Completed): up to five of the project's
 * tasks of one status as compact rows, the soonest due first, with "N more" opening the Tasks tab
 * on that status. Rows change status at once, open on click, and have the row menu and the list
 * keys; "+ Add" opens Create task in the project with this status.
 */
export function OverviewTaskSection({
  project,
  status,
  title,
  count,
  onShowAll,
  collapsed,
}: OverviewTaskSectionProps) {
  const query = useQuery(overviewTasksQuery(project.id, status));
  const tasks = useMemo(
    () => withoutProjectPill(query.data?.items ?? [], project.id),
    [query.data, project.id],
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id as string, t])), [tasks]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  const list = useRef<TaskListHandle>(null);
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const more = count - tasks.length;

  useListCommands(list, {
    open: (row) => openEntity({ id: row.id }),
    setStatus: (rows, next) => actions.setStatus(full(rows), next),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => void actions.trash(full(rows)),
  });

  return (
    <DetailSection
      spacing="page"
      title={title}
      glyph={<StatusIcon status={status} size={12} />}
      count={count}
      collapsible={collapsed !== undefined}
      defaultOpen={!collapsed}
      data-testid={`overview-${status}`}
      action={
        status !== TaskStatus.COMPLETED &&
        !isSynced(project) && (
          <Button
            size="xs"
            icon={Plus}
            onClick={() => createTask({ defaults: { projectId: project.id, status } })}
          >
            Add
          </Button>
        )
      }
    >
      {query.isPending ? (
        <TaskRowSkeleton />
      ) : (
        <>
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
                  compact
                  ref={list}
                  tasks={tasks}
                  selectionBar={false}
                  onStatusChange={(row, next) => actions.setStatus(full([row]), next)}
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
          {more > 0 && tasks.length >= OVERVIEW_SECTION_SIZE && (
            <button type="button" className={styles.more} onClick={onShowAll}>
              {more} more in Tasks
            </button>
          )}
        </>
      )}
    </DetailSection>
  );
}
