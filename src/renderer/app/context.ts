import { useRouteContext } from '@tanstack/react-router';
import type { InitialLoadContext } from '@common/ipc/types';
import type { IpcServices } from '../ipc';
import type { WorkspaceStatusStore } from './workspace-status';

/**
 * What every route reads through the router's context (`beforeLoad`, `loader`) and every page
 * through `useServices()`: the query cache, the tRPC client in both forms, main's push events,
 * main's initial load context, and which workspace is open or opening. The app passes the ones over the preload's bridge (router.tsx);
 * tests pass ones over a fake bridge, so a page never imports the client itself.
 */
export interface RouterContext extends Pick<
  IpcServices,
  'queryClient' | 'trpc' | 'ipc' | 'events'
> {
  initialLoadContext: InitialLoadContext | null;
  workspaceStatus: WorkspaceStatusStore;
}

/** The router's context, from a component. */
export function useServices(): RouterContext {
  return useRouteContext({ from: '__root__' });
}
