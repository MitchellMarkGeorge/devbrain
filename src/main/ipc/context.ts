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
  // null when DevBrain failed to start (startCore() returned null)
  devBrain: DevBrain | null;
  // the workspace open when the call arrived, read fresh on every call
  workspace: Workspace | null;
  log: IpcLogger;
}

export interface CreateContextOptions {
  event: IpcMainInvokeEvent;
  // what startCore() returns; awaited on every call, so calls made while core starts wait for it
  devBrain: Promise<DevBrain | null> | DevBrain | null;
  log: IpcLogger;
}

// Builds a call's context. attachRouter passes the event; whoever attaches the router adds DevBrain
// and the logger
export async function createContext(options: CreateContextOptions): Promise<AppContext> {
  const devBrain = await options.devBrain;
  return {
    event: options.event,
    devBrain,
    workspace: devBrain?.currentWorkspace ?? null,
    log: options.log,
  };
}
