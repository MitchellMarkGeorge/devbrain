import type { IpcMainInvokeEvent } from 'electron';
import type { ChangedEntity } from '@common/changes';

// What every resolver gets, built per call. Milestone 3 of docs/ipc/implementation-plan.md adds
// DevBrain and the open workspace.
export interface AppContext {
  // the call's own event: who sent it (senderFrame), for the sender guard
  event: IpcMainInvokeEvent;
  // adds to the call's `changed`, for a service that emits nothing (milestone 3 fills `changed`
  // from core's own change events too)
  changes: { record(...entities: ChangedEntity[]): void };
}

export function createContext(opts: {
  event: IpcMainInvokeEvent;
  changes: AppContext['changes'];
}): AppContext {
  return { event: opts.event, changes: opts.changes };
}
