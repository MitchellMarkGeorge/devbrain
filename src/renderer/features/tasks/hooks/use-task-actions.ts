import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectId, TaskId } from '@common/ids';
import type { ExternalRef, TaskPriority, TaskStatus } from '@common/types';
import { toast } from '@renderer/components';
import { ipc } from '@renderer/ipc';
import { mutationErrorCopy, useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useMoveToTrash } from '@renderer/shared/hooks/use-move-to-trash';
import { isSynced, patchTaskInCaches, type TaskPatch } from '../api/queries';

/** What an action needs of a task: core's row, or any read that has these. */
export interface TaskRef {
  id: TaskId;
  title: string;
  external?: Pick<ExternalRef, 'state'> | null;
  favoritedAt?: Date | null;
}

/**
 * What the tasks pages do to tasks, on one task or a selection: one call for one task, the bulk
 * route (`tasks.updateMany`, all or nothing) for several. Status, priority and favorite are
 * optimistic (the rows change at once, and change back if the write fails); a failure shows the
 * error toast. A synced task's fields belong to its provider, so writes to them are refused up
 * front with the same words core would use.
 */
export interface TaskActions {
  setStatus(tasks: readonly TaskRef[], status: TaskStatus): void;
  setPriority(tasks: readonly TaskRef[], priority: TaskPriority): void;
  setDueDate(tasks: readonly TaskRef[], dueDate: Date | null): void;
  setStartDate(task: TaskRef, startDate: Date | null): void;
  setProject(tasks: readonly TaskRef[], projectId: ProjectId | null): void;
  /** favorites them all, or unfavorites them all when every one is a favorite already */
  toggleFavorite(tasks: readonly TaskRef[]): void;
  setFavorite(tasks: readonly TaskRef[], favorite: boolean): void;
  /** to the trash, asking first when the setting says so, with the Undo toast */
  trash(tasks: readonly TaskRef[]): Promise<boolean>;
}

const noun = (tasks: readonly TaskRef[]) =>
  tasks.length === 1 ? 'the task' : `${tasks.length} tasks`;

export function useTaskActions(): TaskActions {
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast();
  const moveToTrash = useMoveToTrash();

  return useMemo(() => {
    // refuses a write to a synced task's mirrored fields before it is tried
    const editable = (tasks: readonly TaskRef[]) => {
      if (!tasks.some(isSynced)) return true;
      const copy = mutationErrorCopy({
        data: { code: 'external_read_only', message: '', data: {} },
      });
      toast({ tone: 'error', title: copy.title, description: copy.description });
      return false;
    };

    async function write(
      tasks: readonly TaskRef[],
      patch: TaskPatch,
      action: string,
      call: () => Promise<unknown>,
      optimistic = true,
    ) {
      if (tasks.length === 0) return;
      const ids = tasks.map((task) => task.id);
      const rollback = optimistic ? await patchTaskInCaches(queryClient, ids, patch) : () => {};
      try {
        await call();
      } catch (error) {
        rollback();
        showError(error, action);
      }
    }

    const ids = (tasks: readonly TaskRef[]) => tasks.map((task) => task.id);

    const setFavorite = (tasks: readonly TaskRef[], favorite: boolean) =>
      void write(
        tasks,
        { favoritedAt: favorite ? new Date() : null },
        `Couldn’t ${favorite ? 'favorite' : 'unfavorite'} ${noun(tasks)}`,
        () => Promise.all(tasks.map(({ id }) => ipc.tasks.setFavorite.mutate({ id, favorite }))),
      );

    return {
      setStatus(tasks, status) {
        if (!editable(tasks)) return;
        void write(tasks, { status }, `Couldn’t change the status of ${noun(tasks)}`, () =>
          tasks.length === 1
            ? ipc.tasks.updateStatus.mutate({ id: tasks[0].id, status })
            : ipc.tasks.updateMany.mutate({ ids: ids(tasks), patch: { status } }),
        );
      },
      setPriority(tasks, priority) {
        if (!editable(tasks)) return;
        void write(tasks, { priority }, `Couldn’t change the priority of ${noun(tasks)}`, () =>
          tasks.length === 1
            ? ipc.tasks.update.mutate({ id: tasks[0].id, priority })
            : ipc.tasks.updateMany.mutate({ ids: ids(tasks), patch: { priority } }),
        );
      },
      setDueDate(tasks, dueDate) {
        if (!editable(tasks)) return;
        void write(tasks, { dueDate }, `Couldn’t change the due date of ${noun(tasks)}`, () =>
          tasks.length === 1
            ? ipc.tasks.update.mutate({ id: tasks[0].id, dueDate })
            : ipc.tasks.updateMany.mutate({ ids: ids(tasks), patch: { dueDate } }),
        );
      },
      setStartDate(task, startDate) {
        if (!editable([task])) return;
        void write([task], { startDate }, 'Couldn’t change the start date', () =>
          ipc.tasks.update.mutate({ id: task.id, startDate }),
        );
      },
      setProject(tasks, projectId) {
        if (!editable(tasks)) return;
        // not optimistic: the row's project pill needs the project's name and colour
        void write(
          tasks,
          {},
          `Couldn’t move ${noun(tasks)}`,
          () =>
            tasks.length === 1
              ? ipc.tasks.updateProject.mutate({ id: tasks[0].id, projectId })
              : ipc.tasks.updateMany.mutate({ ids: ids(tasks), patch: { projectId } }),
          false,
        );
      },
      setFavorite,
      toggleFavorite(tasks) {
        setFavorite(tasks, !tasks.every((task) => task.favoritedAt));
      },
      trash(tasks) {
        return moveToTrash(tasks.map(({ id, title }) => ({ id, title })));
      },
    };
  }, [queryClient, showError, moveToTrash]);
}
