import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import { events, ipc, queryClient, trpc } from '../ipc';

// Which workspace main has open, as this window knows it, and the one place the renderer opens
// one: the /app/$workspaceId route asks for the workspace its URL names (docs/renderer/routing.md).
// The renderer never decides which workspace to open on its own: main picks the window's first
// URL, and every switch after that is a navigation.

// the workspace main has open: undefined until known (no initial load context), then from
// `workspace.changed`, which names it on every step of an open and on a close
let openId: WorkspaceId | null | undefined;
// the open this window asked for last, while it runs
let pending: { id: WorkspaceId; promise: Promise<WorkspaceInfo> } | null = null;
// asking main which workspace is open, when the page loaded without knowing
let learning: Promise<void> | null = null;

/**
 * Starts from the workspace open as the page loaded (InitialLoadContext.current; undefined when
 * unknown), and follows main's `workspace.changed` from then on. main.tsx calls it once; tests,
 * once per app. Returns the function that stops following.
 */
export function followOpenWorkspace(current: WorkspaceInfo | null | undefined): () => void {
  openId = current === undefined ? undefined : (current?.id ?? null);
  pending = null;
  learning = null;
  return events.on('workspace.changed', ({ id }) => {
    openId = id;
  });
}

/** The workspace open now, as far as this window knows: null for none, undefined for unknown. */
export function openWorkspaceId(): WorkspaceId | null | undefined {
  return openId;
}

/** True while an open this window asked for runs. */
export function isOpeningWorkspace(): boolean {
  return pending !== null;
}

/**
 * True when `id` is open and nothing is opening: only then may a preload of its pages run, since
 * their loaders read whichever workspace is open.
 */
export function isSettledOn(id: WorkspaceId): boolean {
  return pending === null && openId === id;
}

/**
 * Makes `id` the open workspace: nothing when it is open already (a reload, a navigation within
 * it), else workspaces.open. A second call for the workspace already opening joins that open; a
 * call for another one opens it after (main runs opens one at a time), so the workspace asked for
 * last ends up open, as rapid Back and Forward need. Rejects with the open's error: the workspace
 * open before stays open when the error came before it closed (a missing folder), and none is
 * open otherwise.
 */
export async function ensureWorkspaceOpen(id: WorkspaceId): Promise<void> {
  if (openId === undefined) {
    learning ??= ipc.workspaces.current
      .query()
      .then((info) => {
        if (openId === undefined) openId = info?.id ?? null;
      })
      .finally(() => {
        learning = null;
      });
    await learning;
  }
  if (pending?.id === id) {
    await pending.promise;
    return;
  }
  if (pending === null && openId === id) return;
  const promise = ipc.workspaces.open.mutate({ id }).then((info) => {
    openId = info.id;
    queryClient.setQueryData(trpc.workspaces.current.queryKey(), info);
    return info;
  });
  pending = { id, promise };
  try {
    await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}
