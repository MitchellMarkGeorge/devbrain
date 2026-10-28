// The names main, the preload and the renderer agree on. Every call goes over one channel, naming
// its procedure in the request; each push event is sent on `ipc-event:<name>`.
export const IPC_CALL_CHANNEL = 'ipc:call';
export const IPC_EVENT_PREFIX = 'ipc-event:';
// the key the preload exposes the bridge under, on `window`
export const IPC_BRIDGE_KEY = 'ipcBridge';
