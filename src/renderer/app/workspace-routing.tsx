import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ipcErrorCode } from '../ipc/errors';
import { useServices } from './context';
import { placeAt, placeOf } from './workspace-status';

/**
 * The root's part in a workspace opening or closing: whenever the window is somewhere it no longer
 * belongs, it goes to `/`, which shows the splash while a workspace opens and then sends it on.
 * - A workspace starts opening (this window, the menu, another window): `/` is pushed, so Back
 *   afterwards returns to the page before the switch.
 * - The open workspace closes (an open failed, it was deleted): `/` replaces the page, which is
 *   gone with its workspace.
 * - A call fails with `no_workspace_open` (it closed under the page, and the page missed it): main
 *   is asked again, and the window follows its answer.
 */
export function useWorkspaceRouting(): void {
  const router = useRouter();
  const { queryClient, workspaceStatus } = useServices();

  useEffect(() => {
    const follow = () => {
      const here = placeAt(router.latestLocation.pathname);
      const place = placeOf(workspaceStatus.get());
      // `/` follows the status itself
      if (here === 'opening' || here === place) return;
      void router.navigate({ to: '/', replace: place !== 'opening' });
    };
    const stopStatus = workspaceStatus.subscribe(follow);
    // a change before this listened (the first refresh() can answer before the root mounts)
    follow();

    const onError = (error: unknown) => {
      if (ipcErrorCode(error) === 'no_workspace_open') void workspaceStatus.refresh();
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });

    return () => {
      stopStatus();
      stopQueries();
      stopMutations();
    };
  }, [router, queryClient, workspaceStatus]);
}
