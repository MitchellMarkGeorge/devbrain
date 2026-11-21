import { useCallback } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { entityPath, type EntityRef } from '../lib/entities';

/**
 * Opens an entity where it lives, by its id: a task, project or note's page, or an event in the
 * calendar's sheet. Search results, entity pills and the editor's `onOpenEntity` open through it;
 * the sidebar's Recents and Favorites link to the same `entityPath`.
 */
export function useOpenEntity(): (entity: EntityRef) => void {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  return useCallback(
    (entity) => {
      const href = entityPath(workspaceId, entity);
      if (href) navigate({ href });
    },
    [workspaceId, navigate],
  );
}
