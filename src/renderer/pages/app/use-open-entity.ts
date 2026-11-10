import { useCallback } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { entityPath, type EntityRef } from './entities';

/**
 * Opens an entity where it lives, by its id: a task, project or note's page, or an event in the
 * calendar's sheet. Recents, Favorites, search results, entity pills and the editor's
 * `onOpenEntity` all open through it.
 */
export function useOpenEntity(): (entity: EntityRef) => void {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  return useCallback(
    (entity) => {
      const href = entityPath(workspaceId, entity);
      if (href) void navigate({ href });
    },
    [workspaceId, navigate],
  );
}
