import { contextBridge, ipcRenderer } from 'electron';

// Manual bridge. Every method exposed to the renderer is declared explicitly
// here — no auto-import/codegen. Keep this in sync with src/renderer/env.d.ts.
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
