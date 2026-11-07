import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import type { EventClient } from '../ipc/events';

// Which workspace main has open, as this window knows it, and the one place the renderer opens
// one: the /app/$workspaceId route asks for the workspace its URL names (docs/renderer/routing.md).
// The renderer never decides which workspace to open on its own: main picks the window's first
// URL, and every switch after that is a navigation.

/** The two calls the session makes to main. */
export interface WorkspaceOpener {
  /** the open workspace (workspaces.current) */
  current(): Promise<WorkspaceInfo | null>;
  /** opens it, closing the open one first (workspaces.open) */
  open(id: WorkspaceId): Promise<WorkspaceInfo>;
}

/** A change to what is open that this window did not ask for: a delete, a close, another window. */
export interface OutsideChange {
  /** the workspace open now, or null */
  id: WorkspaceId | null;
}

export class WorkspaceSession {
  // the workspace main has open: undefined until known (no initial load context), then from
  // `workspace.changed`, which names it on every step of an open and on a close
  private open: WorkspaceId | null | undefined;
  // the open this window asked for last, while it runs
  private pending: { id: WorkspaceId; promise: Promise<WorkspaceInfo> } | null = null;
  // asking main which workspace is open, when the page loaded without knowing
  private learning: Promise<void> | null = null;
  private readonly outsideListeners = new Set<(change: OutsideChange) => void>();

  constructor(
    private readonly opener: WorkspaceOpener,
    // the workspace open as the page loaded (InitialLoadContext.current), or undefined: unknown
    current: WorkspaceInfo | null | undefined,
    // told when an open replaces the open workspace's info (workspaces.current's cache)
    private readonly onOpened: (info: WorkspaceInfo) => void = () => {},
  ) {
    this.open = current === undefined ? undefined : (current?.id ?? null);
  }

  /** The workspace open now, as far as this window knows: null for none, undefined for unknown. */
  get openId(): WorkspaceId | null | undefined {
    return this.open;
  }

  /** True while an open this window asked for runs. */
  get opening(): boolean {
    return this.pending !== null;
  }

  /**
   * True when `id` is open and nothing is opening: only then may a preload of its pages run, since
   * their loaders read whichever workspace is open.
   */
  isSettledOn(id: WorkspaceId): boolean {
    return this.pending === null && this.open === id;
  }

  /**
   * Makes `id` the open workspace: nothing when it is open already (a reload, a navigation within
   * it), else `onSwitch` (the splash), then workspaces.open. A second call for the workspace
   * already opening joins that open; a call for another one opens it after (main runs opens one at
   * a time), so the workspace asked for last ends up open, as rapid Back and Forward need.
   * Rejects with the open's error: the workspace open before stays open when the error came
   * before it closed (a missing folder), and none is open otherwise.
   */
  async ensureOpen(id: WorkspaceId, onSwitch: () => void = () => {}): Promise<void> {
    if (this.open === undefined) await this.learnOpen();
    if (this.pending?.id === id) {
      await this.pending.promise;
      return;
    }
    if (this.pending === null && this.open === id) return;
    onSwitch();
    const promise = this.opener.open(id).then((info) => {
      this.open = info.id;
      this.onOpened(info);
      return info;
    });
    this.pending = { id, promise };
    try {
      await promise;
    } finally {
      if (this.pending?.promise === promise) this.pending = null;
    }
  }

  private learnOpen(): Promise<void> {
    this.learning ??= this.opener
      .current()
      .then((info) => {
        if (this.open === undefined) this.open = info?.id ?? null;
      })
      .finally(() => {
        this.learning = null;
      });
    return this.learning;
  }

  /**
   * Follows `workspace.changed`. Main sends it on every step of an open, this window's included,
   * before the open answers; the steps of this window's own opens are its own, and any other
   * change that settles on a workspace (or on none) goes to `onOutsideChange`'s listeners.
   * Returns the function that stops.
   */
  follow(events: EventClient<AppEvents>): () => void {
    return events.on('workspace.changed', ({ id, opening }) => {
      this.open = id;
      if (opening !== null || this.pending !== null) return;
      for (const listener of this.outsideListeners) listener({ id });
    });
  }

  /** Listens for changes to what is open that no open of this window's made. */
  onOutsideChange(listener: (change: OutsideChange) => void): () => void {
    this.outsideListeners.add(listener);
    return () => this.outsideListeners.delete(listener);
  }
}
