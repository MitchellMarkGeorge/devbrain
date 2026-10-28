import type { IpcMainInvokeEvent } from 'electron';
import type { DevBrain, Workspace } from '@main/core';
import type { ChangeRecorder } from './server';

// where the logging middleware writes: each call at debug, a failed one at warn
export interface IpcLogger {
  debug(...params: unknown[]): void;
  warn(...params: unknown[]): void;
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
  // the call's change scope: adds to its `changed`, for a service that emits nothing
  changes: ChangeRecorder;
  log: IpcLogger;
}

export interface ContextOptions {
  // what startCore() returns; awaited on every call, so calls made while core starts wait for it
  devBrain: Promise<DevBrain | null> | DevBrain | null;
  log: IpcLogger;
}

// attachRouter's createContext
export function contextFactory(options: ContextOptions) {
  return async ({
    event,
    changes,
  }: {
    event: IpcMainInvokeEvent;
    changes: ChangeRecorder;
  }): Promise<AppContext> => {
    const devBrain = await options.devBrain;
    return {
      event,
      devBrain,
      workspace: devBrain?.currentWorkspace ?? null,
      changes,
      log: options.log,
    };
  };
}
