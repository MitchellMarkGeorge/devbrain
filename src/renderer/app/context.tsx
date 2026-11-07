import { createContext, useContext, type ReactNode } from 'react';
import type { InitialLoadContext } from '@common/ipc/types';
import type { IpcServices } from '../ipc';

/**
 * What every page reads through `useServices()`, and every route through the router's context
 * (`beforeLoad`, `loader`): the query cache, the tRPC client in both forms, main's push events and
 * main's initial load context. The app passes the ones over the preload's bridge (main.tsx); tests
 * pass ones over a fake bridge, so a page never imports the client itself. A React context rather
 * than the router's alone, so the splash and the window's top level read it outside any router.
 */
export interface Services extends Pick<IpcServices, 'queryClient' | 'trpc' | 'ipc' | 'events'> {
  initialLoadContext: InitialLoadContext | null;
}

// the routers' context is the same object
export type RouterContext = Services;

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

/** The window's services, from `ServicesProvider`. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices needs a ServicesProvider');
  return services;
}
