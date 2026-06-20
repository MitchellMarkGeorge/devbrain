/// <reference types="vite/client" />

// Types for the bridge exposed in src/preload/index.ts.
// Importing the Api type from preload keeps these in lockstep automatically.
import type { Api } from '../preload';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
