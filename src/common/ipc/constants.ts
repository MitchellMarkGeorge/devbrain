// The names main, the preload and the renderer agree on. Every call goes over one channel, naming
// its procedure in the request; each push event is sent on `ipc-event:<name>`.
export const IPC_CALL_CHANNEL = 'ipc:call';
export const IPC_EVENT_PREFIX = 'ipc-event:';
// The one synchronous message: the preload asks main for the initial load context as the page
// loads (src/main/ipc/initial-load-context.ts)
export const IPC_INITIAL_LOAD_CONTEXT_CHANNEL = 'ipc:initial-load-context';
// the key the preload exposes the bridge under, on `window`
export const IPC_BRIDGE_KEY = 'ipcBridge';
