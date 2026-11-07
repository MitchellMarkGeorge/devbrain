import type { RouterHistory } from '@tanstack/react-router';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { InitialLoadContext, IpcBridge, IpcRequest, IpcResult } from '@common/ipc/types';
import { lastPageSchema, type AppSettings, type WorkspaceInfo } from '@common/types';

// Main, as far as the window can tell: the workspace registry and settings, the transitions of
// WorkspaceService.openWorkspace in their order (opening, closed, opened or openFailed), sent as
// the ChangeTracker sends them (`workspace.changed` with { id: open, opening }), and the page
// tracking of runtime/last-page.ts: it follows the window's URL and saves the page in the closing
// workspace's manifest at `closed`, then forgets it.

export const A = 'wsp_aaaaaaaaaaaaaaaaaaaaaa' as WorkspaceId;
export const B = 'wsp_bbbbbbbbbbbbbbbbbbbbbb' as WorkspaceId;

export function workspace(id: WorkspaceId, name: string, lastPage: string | null): WorkspaceInfo {
  return {
    id,
    name,
    color: '#3b82f6',
    path: `/w/${id}`,
    createdAt: 1,
    lastOpenedAt: null,
    lastPage,
  };
}

export function settings(general: Partial<AppSettings['general']> = {}): AppSettings {
  return {
    theme: 'system',
    devBrainPath: '/devbrain',
    general: {
      defaultLandingPage: 'home',
      launchOnStartup: false,
      openToLastPage: true,
      timeFormat: '12',
      confirmBeforeArchiving: true,
      confirmBeforeDeleting: true,
      ...general,
    },
    tasks: {
      defaultSort: 'priority',
      defaultView: 'list',
      defaultDueDate: 'today',
      defaultPriority: 0 as AppSettings['tasks']['defaultPriority'],
      showCompletedTasks: false,
    },
    calendar: {
      defaultEventDuration: '15m',
      defaultView: 'week',
      firstDayOfWeek: 'monday',
      hideWeekends: false,
    },
  };
}

class CallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A promise the test resolves: a slow loader, a slow open. */
export function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

export class FakeMain {
  readonly workspaces = new Map<WorkspaceId, WorkspaceInfo>();
  settings = settings();
  current: WorkspaceId | null = null;
  lastWorkspaceId: WorkspaceId | null = null;
  // what last-page.ts holds: the page in the window's URL
  page: string | null = null;
  // awaited before a workspace finishes opening; set to fail it
  openGate: Promise<void> | null = null;
  failOpen = false;
  // awaited before tasks.list answers, per workspace
  readonly listGates = new Map<WorkspaceId, Promise<void>>();
  readonly sent: AppEvents['workspace.changed'][] = [];
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  constructor(workspaces: WorkspaceInfo[]) {
    workspaces.forEach((w) => this.workspaces.set(w.id, w));
  }

  /** Follows the window's URL, as did-navigate-in-page does. */
  track(history: RouterHistory): () => void {
    const follow = (href: string) => {
      this.page = lastPageSchema.safeParse(href).success ? href : null;
    };
    follow(history.location.href);
    return history.subscribe(({ location }) => follow(location.href));
  }

  initialLoadContext(): InitialLoadContext {
    const info = (id: WorkspaceId | null) => (id ? this.workspaces.get(id)! : null);
    return {
      devBrainAvailable: true,
      current: info(this.current),
      last: this.current ? null : info(this.lastWorkspaceId),
      workspaces: { items: [...this.workspaces.values()], nextCursor: null },
      theme: 'system',
    };
  }

  readonly bridge: IpcBridge = {
    invoke: async (request: IpcRequest): Promise<IpcResult<unknown>> => {
      try {
        return { ok: true, data: await this.call(request), changed: [] };
      } catch (error) {
        const { code, message } = error as CallError;
        return {
          ok: false,
          error: { code: -32603, message, data: { code, message, data: {} } },
          changed: [],
        } as IpcResult<unknown>;
      }
    },
    subscribe: (name, listener) => {
      const set = this.listeners.get(name) ?? new Set();
      set.add(listener);
      this.listeners.set(name, set);
      return () => set.delete(listener);
    },
    initialLoadContext: null,
    platform: 'darwin',
  };

  async open(id: WorkspaceId): Promise<WorkspaceInfo> {
    this.emit({ opening: id });
    await Promise.resolve();
    this.close(id);
    await this.openGate;
    if (this.failOpen) {
      this.emit({ opening: null });
      throw new CallError('workspace_migration', 'The workspace could not be opened');
    }
    this.current = id;
    this.lastWorkspaceId = id;
    this.emit({ opening: null });
    return this.workspaces.get(id)!;
  }

  /** WorkspaceService.close (or a delete): the open workspace closes and none opens. */
  closeWorkspace(): void {
    this.close(null);
  }

  private close(opening: WorkspaceId | null): void {
    const closing = this.current;
    if (closing === null) return;
    this.current = null;
    // last-page.ts, on `closed`
    if (this.page !== null) {
      this.workspaces.set(closing, { ...this.workspaces.get(closing)!, lastPage: this.page });
    }
    this.page = null;
    this.emit({ opening });
  }

  private emit({ opening }: { opening: WorkspaceId | null }): void {
    const payload = { id: this.current, opening };
    this.sent.push(payload);
    this.listeners.get('workspace.changed')?.forEach((listener) => listener(payload));
  }

  private async call({ path, input }: IpcRequest): Promise<unknown> {
    switch (path) {
      case 'workspaces.current':
        return this.current ? this.workspaces.get(this.current)! : null;
      case 'workspaces.list':
        return { items: [...this.workspaces.values()], nextCursor: null };
      case 'workspaces.openLast':
        if (this.current) return this.workspaces.get(this.current)!;
        return this.lastWorkspaceId ? this.open(this.lastWorkspaceId) : null;
      case 'workspaces.open':
        return this.open((input as { id: WorkspaceId }).id);
      case 'settings.get':
        return this.settings;
      case 'tasks.list': {
        const served = this.current;
        if (served === null) throw new CallError('no_workspace_open', 'No workspace is open');
        await this.listGates.get(served);
        if (this.current !== served) throw new CallError('no_workspace_open', 'Closed meanwhile');
        const { name } = this.workspaces.get(served)!;
        const items = [1, 2].map((n) => ({ id: `tsk_${served}${n}`, title: `${name} task ${n}` }));
        return { items, nextCursor: null };
      }
      default:
        throw new CallError('internal', `No fake for ${path}`);
    }
  }
}
