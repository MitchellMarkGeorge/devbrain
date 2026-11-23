import { useCallback } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { ProjectId } from '@common/ids';
import type { TaskSummary } from '@common/types';
import { useModals } from '@renderer/app/modals';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { CreateTaskDialog, type CreateTaskDefaults } from '../components/create/CreateTaskDialog';

export interface CreateTaskOptions {
  /** a subtask of this task */
  parent?: TaskSummary;
  defaults?: CreateTaskDefaults;
}

/**
 * Opens the Create task dialog (or Create subtask, with `parent`): a board column's "Add task", a
 * group's "+", a task page's Subtasks "+ Add", an editor's "/task" (passed to
 * WorkspaceRichTextEditor as `openNewTaskDialog`). C and the title bar's New task use
 * `useCreateTaskHere`.
 */
export function useCreateTask(): (options?: CreateTaskOptions) => void {
  const modals = useModals();
  const openEntity = useOpenEntity();
  return useCallback(
    (options = {}) => {
      modals.open((props) => (
        <CreateTaskDialog {...props} {...options} onOpenTask={(id) => openEntity({ id })} />
      ));
    },
    [modals, openEntity],
  );
}

/**
 * The project the page in view is about, read from the URL: the tasks page's project filter, or
 * the project page open (any of its tabs). undefined elsewhere, and for the "No project" filter.
 */
export function usePageProject(): ProjectId | undefined {
  return useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        if (match.routeId === '/app/$workspaceId/projects/$projectId')
          return (match.params as { projectId: ProjectId }).projectId;
        if (match.routeId === '/app/$workspaceId/tasks/') {
          const project = (match.search as { project?: ProjectId | 'none' }).project;
          return project === 'none' ? undefined : project;
        }
      }
      return undefined;
    },
  });
}

/**
 * Opens Create task filed where the page is (`usePageProject`): C anywhere and the title bar's New
 * task. On the tasks page filtered to a project, or on a project's page, the task starts in it.
 */
export function useCreateTaskHere(): () => void {
  const createTask = useCreateTask();
  const projectId = usePageProject();
  return useCallback(
    () => createTask(projectId ? { defaults: { projectId } } : undefined),
    [createTask, projectId],
  );
}
