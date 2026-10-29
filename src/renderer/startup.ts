import type { WorkspaceEntry } from '@main/core';
import type { BootSnapshot } from './ipc/boot';

// Which screen the app shows, from what main said at load (the boot snapshot), the workspace
// queries and the open in progress. Kept apart from React so it can be tested on its own.

// An open the app asked for. Only one runs at a time: the splash shows while it does.
export type OpenRequest =
  // the workspace open last time, at startup; `workspace` is what the splash shows
  | { kind: 'last'; workspace: WorkspaceEntry | null }
  | { kind: 'open'; workspace: WorkspaceEntry }
  // creates the workspace, then opens it
  | { kind: 'create'; name: string; color: string };

// what the splash shows of the workspace being opened, when known
export type SplashWorkspace = Pick<WorkspaceEntry, 'name' | 'color'>;

export type Screen =
  | { screen: 'unavailable' }
  | { screen: 'splash'; workspace: SplashWorkspace | null }
  | { screen: 'workspace'; workspace: WorkspaceEntry }
  | { screen: 'create'; error: string | null; canCancel: boolean }
  | { screen: 'picker'; workspaces: WorkspaceEntry[]; error: string | null };

export interface StartupState {
  boot: BootSnapshot | null;
  // whether the app has asked to open the last workspace yet (it does once, on mount)
  askedForLast: boolean;
  // the open running now, if any
  opening: OpenRequest | null;
  // the last open's failure, shown on the screen that follows
  openError: unknown;
  // workspaces.current: undefined until loaded
  current: WorkspaceEntry | null | undefined;
  currentError: unknown;
  // workspaces.list: undefined until loaded
  workspaces: WorkspaceEntry[] | undefined;
  // the user chose to make a new workspace from the picker
  creatingNew: boolean;
}

/**
 * Whether the page opens the last workspace as it loads: when main said none is open and there
 * is one to reopen, or when there is no snapshot to say (openLast returns the open one then).
 */
export function opensLastOnLoad(boot: BootSnapshot | null): boolean {
  return boot === null || (boot.current === null && boot.last !== null);
}

export function chooseScreen(state: StartupState): Screen {
  if (
    state.boot?.devBrainAvailable === false ||
    errorCode(state.currentError) === 'devbrain_unavailable'
  ) {
    return { screen: 'unavailable' };
  }
  if (state.opening !== null)
    return { screen: 'splash', workspace: splashWorkspace(state.opening) };
  // the first render, before the effect that asks for it has run
  if (!state.askedForLast && opensLastOnLoad(state.boot)) {
    return { screen: 'splash', workspace: state.boot?.last ?? null };
  }
  if (state.current) return { screen: 'workspace', workspace: state.current };
  // only without a snapshot: the queries are still loading
  if (state.current === undefined || state.workspaces === undefined) {
    return { screen: 'splash', workspace: null };
  }
  const error = state.openError ? errorMessage(state.openError) : null;
  if (state.workspaces.length === 0 || state.creatingNew) {
    return { screen: 'create', error, canCancel: state.workspaces.length > 0 };
  }
  return { screen: 'picker', workspaces: state.workspaces, error };
}

function splashWorkspace(request: OpenRequest): SplashWorkspace | null {
  if (request.kind === 'create') return { name: request.name, color: request.color };
  return request.workspace;
}

// the code main gave a failed call (IpcErrorCode), from tRPC's client error
export function errorCode(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null | undefined)?.data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong';
}
