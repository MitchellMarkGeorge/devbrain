// The names main, the preload and the renderer agree on. Each procedure has its own channel,
// `ipc:<path>`; each push event is sent on `ipc-event:<name>`.
export const IPC_CHANNEL_PREFIX = 'ipc:';
export const IPC_EVENT_PREFIX = 'ipc-event:';
// the key the preload exposes the bridge under, on `window`
export const IPC_BRIDGE_KEY = 'ipcBridge';

// what the preload accepts as a procedure path or an event name
export const IPC_NAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

// router keys the renderer's client and query helpers use for their own properties (`then` so
// that awaiting a router node doesn't hang); a router may not use them
export const RESERVED_SEGMENTS: readonly string[] = [
  'then',
  'queryKey',
  'pathKey',
  'queryOptions',
  'infiniteQueryOptions',
  'mutationOptions',
];
