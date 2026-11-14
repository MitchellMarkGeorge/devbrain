import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { RecentId } from '@common/types';
import { trpc } from '@renderer/ipc';

/**
 * Records a visit to an entity's page in Recents (`recents.recordView`), once per visit: when the
 * page mounts and when its id changes. Detail pages call it with their entity's id.
 */
export function useRecordView(id: RecentId): void {
  const { mutate } = useMutation(trpc.recents.recordView.mutationOptions());
  useEffect(() => {
    // a failure is no reason to bother the user: Recents just misses this visit
    mutate({ id }, { onError: (error) => console.warn('Recording a view failed', error) });
  }, [id, mutate]);
}
