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

export class CallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data: Record<string, unknown> = {},
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
  // every call's path, in order
  readonly calls: string[] = [];
  // paths whose next call fails, once
  readonly failOnce = new Set<string>();
  // workspaces whose folder is gone: opening one fails before anything closes
  readonly missing = new Set<WorkspaceId>();
  // what "Open Existing Folder…" adds: a workspace, null (cancelled) or the error main throws
  importResult: WorkspaceInfo | null | CallError = null;
  // false: main couldn't load DevBrain
  devBrainAvailable = true;
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
      devBrainAvailable: this.devBrainAvailable,
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
        const { code, message, data } = error as CallError;
        return {
          ok: false,
          error: { code: -32603, message, data: { code, message, data } },
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
    this.calls.push(path);
    if (this.failOnce.delete(path)) throw new CallError('internal', 'Something went wrong');
    switch (path) {
      case 'app.version':
        return '0.0.1';
      case 'app.showLogFile':
        return undefined;
      case 'workspaces.current':
        return this.current ? this.workspaces.get(this.current)! : null;
      case 'workspaces.list':
        return { items: [...this.workspaces.values()], nextCursor: null };
      case 'workspaces.openLast':
        if (this.current) return this.workspaces.get(this.current)!;
        return this.lastWorkspaceId ? this.open(this.lastWorkspaceId) : null;
      case 'workspaces.open': {
        const { id } = input as { id: WorkspaceId };
        // WorkspaceService checks the folder before it sends anything: the open one stays open
        if (this.missing.has(id)) {
          throw new CallError('workspace_data_missing', 'No workspace data found');
        }
        return this.open(id);
      }
      case 'workspaces.create': {
        const { name, color } = input as { name: string; color: string };
        const id = `wsp_${'c'.repeat(21)}${this.workspaces.size}` as WorkspaceId;
        const created = { ...workspace(id, name, null), color };
        this.workspaces.set(id, created);
        return created;
      }
      case 'workspaces.importFolder': {
        const result = this.importResult;
        if (result instanceof CallError) throw result;
        if (result) this.workspaces.set(result.id, result);
        return result;
      }
      case 'settings.get':
        return this.settings;
      default:
        if (path in WORKSPACE_ROWS) return this.rows(path as keyof typeof WORKSPACE_ROWS);
        throw new CallError('internal', `No fake for ${path}`);
    }
  }

  // A page's first rows, named after the workspace that served them ("Beta task 1"), once that
  // workspace's gate opens; refused when none is open, as wsProcedure does
  private async rows(path: keyof typeof WORKSPACE_ROWS): Promise<unknown> {
    const served = this.current;
    if (served === null) throw new CallError('no_workspace_open', 'No workspace is open');
    await this.listGates.get(served);
    if (this.current !== served) throw new CallError('no_workspace_open', 'Closed meanwhile');
    const { name } = this.workspaces.get(served)!;
    const [kind, shape] = WORKSPACE_ROWS[path];
    const rows = [1, 2].map((n) => {
      const title = `${name} ${kind} ${n}`;
      const id = `${kind}_${served}${n}`;
      if (shape === 'recent')
        return { entityType: 'tasks', entity: { id, title }, viewedAt: new Date() };
      if (shape === 'named') return { id, name: title, accountLabel: title };
      return { id, title };
    });
    return shape === 'page' || shape === 'recent' ? { items: rows, nextCursor: null } : rows;
  }
}

// the routes the placeholder pages load, with what each row is called and how they come
const WORKSPACE_ROWS = {
  'tasks.list': ['task', 'page'],
  'notes.list': ['note', 'page'],
  'projects.list': ['project', 'page'],
  'archive.listArchived': ['trashed', 'page'],
  'recents.list': ['recent', 'recent'],
  'calendars.list': ['calendar', 'named'],
  'integrations.list': ['account', 'named'],
} as const;
