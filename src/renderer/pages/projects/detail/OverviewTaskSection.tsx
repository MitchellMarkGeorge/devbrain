import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Project, TaskListItem, TaskStatus } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DetailSection,
  QuickAddRow,
  TaskList,
  TaskRowSkeleton,
  type TaskListHandle,
} from '../../../components';
import { ipc } from '../../../ipc';
import { KeyScope, useListCommands } from '../../../keyboard';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { useOpenEntity } from '../../app/use-open-entity';
import { TaskMenuItems } from '../../tasks/menus/TaskMenus';
import { isSynced, withoutProjectPill } from '../../tasks/queries';
import { useTaskActions } from '../../tasks/use-task-actions';
import type { overviewOpenTasksQuery } from '../queries';
import styles from './ProjectPage.module.css';

export interface OverviewTaskSectionProps {
  project: Project;
  title: string;
  /** the 12px glyph after the title */
  glyph?: ReactNode;
  /** the section's tasks: a `tasks.list` query of as many as it shows */
  query: ReturnType<typeof overviewOpenTasksQuery>;
  /** how many tasks the section stands for, from the project's stats */
  count: number;
  /** opens the Tasks tab on the section's tasks, for those it leaves out */
  onShowAll: () => void;
  /** the "Add task…" row under the rows creates a task in the project with this status; none without it */
  addStatus?: TaskStatus;
  /** what the section says when it has no tasks */
  empty?: ReactNode;
  /** under the rows (and the "Add task…" row): "Move Tasks Here" on an empty project */
  footer?: ReactNode;
  'data-testid'?: string;
}

/**
 * One of the Overview's task sections (Open tasks, Recently completed): a few of the project's
 * tasks as compact rows, with "N more in Tasks" opening the Tasks tab on the rest. Rows change
 * status at once, open on click, and have the row menu and the list keys. They leave out the
 * project pill and the linked note's: the overview is a summary, and the Tasks tab has them. The
 * "Add task…" row creates a task in the project from its title, and stays open for the next.
 */
export function OverviewTaskSection({
  project,
  title,
  glyph,
  query: options,
  count,
  onShowAll,
  addStatus,
  empty,
  footer,
  'data-testid': testId,
}: OverviewTaskSectionProps) {
  const query = useQuery(options);
  const tasks = useMemo(
    () =>
      withoutProjectPill(query.data?.items ?? [], project.id).map((task) =>
        task.link ? { ...task, link: null } : task,
      ),
    [query.data, project.id],
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id as string, t])), [tasks]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast('Couldn’t add the task');
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
    <DetailSection spacing="page" title={title} glyph={glyph} count={count} data-testid={testId}>
      {query.isPending ? (
        <TaskRowSkeleton />
      ) : tasks.length === 0 ? (
        empty && <p className={styles.sectionEmpty}>{empty}</p>
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
        </>
      )}
      {addStatus !== undefined && !isSynced(project) && (
        <QuickAddRow
          className={styles.quickAdd}
          onCreate={(title) =>
            void ipc.tasks.create
              .mutate({ title, projectId: project.id, status: addStatus })
              .catch((error: unknown) => showError(error))
          }
        />
      )}
      {more > 0 && !query.isPending && (
        <button type="button" className={styles.more} onClick={onShowAll}>
          {more} more in Tasks
        </button>
      )}
      {footer}
    </DetailSection>
  );
}
