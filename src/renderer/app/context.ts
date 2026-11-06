import { useRouteContext } from '@tanstack/react-router';
import type { InitialLoadContext } from '@common/ipc/types';
import type { IpcServices } from '../ipc';

/**
 * What every route reads through the router's context (`beforeLoad`, `loader`) and every page
 * through `useServices()`: the query cache, the tRPC client in both forms, main's push events, and
 * main's initial load context. The app passes the ones over the preload's bridge (router.tsx);
 * tests pass ones over a fake bridge, so a page never imports the client itself.
 */
export interface RouterContext extends Pick<
  IpcServices,
  'queryClient' | 'trpc' | 'ipc' | 'events'
> {
  initialLoadContext: InitialLoadContext | null;
}

/** The router's context, from a component. */
export function useServices(): RouterContext {
  return useRouteContext({ from: '__root__' });
}
