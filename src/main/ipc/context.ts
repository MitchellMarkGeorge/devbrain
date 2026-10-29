import type { IpcMainInvokeEvent } from 'electron';
import type { DevBrain, Workspace } from '@main/core';

// where the logging middleware writes each call
export interface IpcLogger {
  debug(...params: unknown[]): void;
}

// What every resolver gets, built per call. A route that needs DevBrain or a workspace starts from
// a base procedure (procedures.ts) whose middleware narrows these to non-null.
export interface AppContext {
  // the call's own event
  event: IpcMainInvokeEvent;
  // null when DevBrain could not be loaded (loadCore() in src/main/index.ts returned null)
  devBrain: DevBrain | null;
  // the workspace open when the call arrived, read fresh on every call
  workspace: Workspace | null;
  log: IpcLogger;
}

export interface CreateContextOptions {
  event: IpcMainInvokeEvent;
  // null when DevBrain could not be loaded
  devBrain: DevBrain | null;
  log: IpcLogger;
}

// Builds a call's context. attachRouter passes the event; whoever attaches
// the router adds DevBrain and the logger
export function createContext(options: CreateContextOptions): AppContext {
  const { devBrain } = options;
  return {
    event: options.event,
    devBrain,
    workspace: devBrain?.currentWorkspace ?? null,
    log: options.log,
  };
}
