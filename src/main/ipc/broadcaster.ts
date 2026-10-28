import { BrowserWindow } from 'electron';
import type { AppEventName, AppEvents } from '@common/events';
import { IPC_EVENT_PREFIX } from '@common/ipc/constants';

// Sends a push event to the whole app. The ChangeRouter sends through this; tests pass a fake.
export interface Broadcaster {
  send<N extends AppEventName>(name: N, payload: AppEvents[N]): void;
}

// Every open window's page, on `ipc-event:<name>`, which the preload's bridge.subscribe listens on.
// A window being torn down is skipped.
export function webContentsBroadcaster(): Broadcaster {
  return {
    send(name, payload) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
        window.webContents.send(`${IPC_EVENT_PREFIX}${name}`, payload);
      }
    },
  };
}
