import type { IpcMainInvokeEvent } from 'electron';

// What every resolver gets, built per call. Milestone 3 of docs/ipc/implementation-plan.md adds
// DevBrain, the open workspace and the change recorder.
export interface AppContext {
  // the call's own event: who sent it (senderFrame), for the sender guard
  event: IpcMainInvokeEvent;
}

export function createContext(event: IpcMainInvokeEvent): AppContext {
  return { event };
}
