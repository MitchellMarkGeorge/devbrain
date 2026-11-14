import { useMemo } from 'react';
import type { ProjectId } from '@common/ids';
import type { ExternalRef, ProjectStatus } from '@common/types';
import { toast } from '@renderer/components';
import { ipc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useMoveToTrash } from '@renderer/shared/hooks/use-move-to-trash';
import { isSynced } from '@renderer/features/tasks/api/queries';

/** What an action needs of a project: core's row, or any read that has these. */
export interface ProjectRef {
  id: ProjectId;
  title: string;
  external?: Pick<ExternalRef, 'state'> | null;
  favoritedAt?: Date | null;
}

/** The fields `projects.update` writes; null clears one. */
export interface ProjectFields {
  title?: string;
  description?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  color?: string | null;
}

/**
 * What the projects pages do to a project. Each write refetches what it changed through its
 * `changed`; a failure shows the error toast. A synced (Linear) project's fields belong to its
 * provider, so writes to them are refused up front with the words core would use; favoriting it
 * still works.
 */
export interface ProjectActions {
  setStatus(project: ProjectRef, status: ProjectStatus): void;
  update(project: ProjectRef, fields: ProjectFields): void;
  setFavorite(project: ProjectRef, favorite: boolean): void;
  /** to the trash, asking first when the setting says so, with the Undo toast */
  trash(project: ProjectRef): Promise<boolean>;
  // on a selection (the list's selection bar and keys), one call per project, as there are no
  // bulk project routes
  /** sets every project's status; none is changed when one is synced */
  setStatusOf(projects: readonly ProjectRef[], status: ProjectStatus): void;
  /** favorites them all, or unfavorites them all when every one is a favorite already */
  toggleFavorite(projects: readonly ProjectRef[]): void;
  /** to the trash, asking once; none moves when one is synced */
  trashAll(projects: readonly ProjectRef[]): Promise<boolean>;
}

/** Why a synced project's fields can't change here (core's external_read_only). */
export const SYNCED_PROJECT = {
  title: 'This project is synced from Linear',
  description: 'Change it there.',
};

export function useProjectActions(): ProjectActions {
  const showError = useMutationErrorToast();
  const moveToTrash = useMoveToTrash();
  return useMemo(() => {
    const editable = (project: ProjectRef) => {
      if (!isSynced(project)) return true;
      toast({ tone: 'error', ...SYNCED_PROJECT });
      return false;
    };
    return {
      setStatus(project, status) {
        if (!editable(project)) return;
        ipc.projects.updateStatus
          .mutate({ id: project.id, status })
          .catch((error: unknown) => showError(error, 'Couldn’t change the project’s status'));
      },
      update(project, fields) {
        if (!editable(project)) return;
        ipc.projects.update
          .mutate({ id: project.id, ...fields })
          .catch((error: unknown) => showError(error, 'Couldn’t save the project'));
      },
      setFavorite(project, favorite) {
        ipc.projects.setFavorite
          .mutate({ id: project.id, favorite })
          .catch((error: unknown) =>
            showError(error, `Couldn’t ${favorite ? 'favorite' : 'unfavorite'} the project`),
          );
      },
      trash: (project) => moveToTrash([project]),
      setStatusOf(projects, status) {
        if (!projects.every(editable)) return;
        Promise.all(
          projects.map(({ id }) => ipc.projects.updateStatus.mutate({ id, status })),
        ).catch((error: unknown) => showError(error, 'Couldn’t change the projects’ status'));
      },
      toggleFavorite(projects) {
        const favorite = !projects.every((project) => project.favoritedAt);
        Promise.all(
          projects.map(({ id }) => ipc.projects.setFavorite.mutate({ id, favorite })),
        ).catch((error: unknown) =>
          showError(error, `Couldn’t ${favorite ? 'favorite' : 'unfavorite'} the projects`),
        );
      },
      async trashAll(projects) {
        if (!projects.every(editable)) return false;
        return moveToTrash(projects);
      },
    };
  }, [showError, moveToTrash]);
}
