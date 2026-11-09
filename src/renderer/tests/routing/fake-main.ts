import type { AppEvents } from '@common/events';
import type { ChangedEntity } from '@common/changes';
import type { WorkspaceId } from '@common/ids';
import type {
  InitialLoadContext,
  IpcBridge,
  IpcErrorCode,
  IpcRequest,
  IpcResult,
} from '@common/ipc/types';
import type { AppSettings, WorkspaceInfo } from '@common/types';
import { fakeTask, FakeTasks } from './fake-tasks';

// A main process for the renderer's routing tests, over the IPC bridge: a registry of workspaces
// that opens them as core's WorkspaceService does (opening, then closed, then opened or
// openFailed, each as workspace.changed, before the call answers), the settings, and the pages'
// list routes, which answer for the open workspace only. Every call is recorded with the
// workspace open when it arrived. A route can be held, to make a page slow.

export interface FakeWorkspace extends WorkspaceInfo {
  // the folder is gone: open fails before anything closes (workspace_data_missing)
  missing?: boolean;
  // opening fails after the open one has closed, with this code (a failed migration)
  failsAfterClose?: IpcErrorCode;
}

export interface Call {
  path: string;
  input: unknown;
  // the workspace open when the call arrived
  open: WorkspaceId | null;
}

const PAGE_ROUTES = new Set([
  'recents.list',
  'projects.list',
  'notes.list',
  'calendars.list',
  'integrations.list',
  'archive.listArchived',
]);

export function workspace(
  id: string,
  name: string,
  extra: Partial<FakeWorkspace> = {},
): FakeWorkspace {
  return {
    id: id as WorkspaceId,
    name,
    color: '#2b7fff',
    path: `/brain/workspaces/${id}`,
    createdAt: 1_700_000_000_000,
    lastOpenedAt: null,
    lastPage: null,
    ...extra,
  };
}

class RemoteError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
    readonly data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface Hold {
  promise: Promise<void>;
  release: () => void;
}

export class FakeMain {
  readonly workspaces: FakeWorkspace[];
  open: WorkspaceId | null = null;
  settings: AppSettings['general'] = {
    defaultLandingPage: 'home',
    launchOnStartup: false,
    openToLastPage: false,
    confirmBeforeDeleting: true,
    confirmBeforeArchiving: false,
    timeFormat: '12',
  };
  readonly calls: Call[] = [];
  readonly events: AppEvents['workspace.changed'][] = [];
  // the tasks settings the tasks page reads
  taskSettings: AppSettings['tasks'] = {
    defaultSort: 'priority',
    defaultPriority: 1,
    defaultDueDate: 'today',
    defaultView: 'list',
    showCompletedTasks: false,
  };
  // each workspace's tasks and projects; a workspace without any lists one task naming it
  readonly taskStores = new Map<WorkspaceId, FakeTasks>();
  // what workspaces.importFolder answers next: a folder's workspace, null (cancelled) or an error
  importResult: FakeWorkspace | null | RemoteError = null;
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly holds = new Map<string, Hold>();
  private created = 0;

  constructor(workspaces: FakeWorkspace[], open: WorkspaceId | null = null) {
    this.workspaces = workspaces;
    this.open = open;
  }

  /** Makes `path` wait until the returned function is called. */
  hold(path: string): () => void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    const hold = { promise, release };
    this.holds.set(path, hold);
    return () => {
      this.holds.delete(path);
      release();
    };
  }

  /** The calls made to `path`. */
  callsTo(path: string): Call[] {
    return this.calls.filter((call) => call.path === path);
  }

  static error(code: IpcErrorCode, message: string, data: Record<string, unknown> = {}) {
    return new RemoteError(code, message, data);
  }

  // the settings the pages read (the general group), as settings.get answers
  private appSettings(): AppSettings {
    return { theme: 'system', general: this.settings, tasks: this.taskSettings } as AppSettings;
  }

  initialLoadContext(): InitialLoadContext {
    return {
      devBrainAvailable: true,
      current: this.info(this.open),
      workspaces: { items: this.workspaces.map(strip), nextCursor: null },
      settings: this.appSettings(),
    };
  }

  bridge(initialLoadContext: InitialLoadContext | null = this.initialLoadContext()): IpcBridge {
    return {
      invoke: (request) => this.invoke(request),
      subscribe: (name, listener) => {
        const set = this.listeners.get(name) ?? new Set();
        set.add(listener);
        this.listeners.set(name, set);
        return () => set.delete(listener);
      },
      initialLoadContext,
      platform: 'darwin',
    };
  }

  /** Another window, or the menu, opens a workspace: only the events reach this window. */
  async openElsewhere(id: WorkspaceId): Promise<void> {
    await this.openWorkspace(id);
  }

  private emit(name: 'workspace.changed', payload: AppEvents['workspace.changed']) {
    if (name === 'workspace.changed') this.events.push(payload);
    for (const listener of this.listeners.get(name) ?? []) listener(payload);
  }

  private info(id: WorkspaceId | null): WorkspaceInfo | null {
    const found = this.workspaces.find((w) => w.id === id);
    return found ? strip(found) : null;
  }

  private async invoke(request: IpcRequest): Promise<IpcResult<unknown>> {
    this.calls.push({ path: request.path, input: request.input, open: this.open });
    // an IPC round trip: never synchronous
    await Promise.resolve();
    const hold = this.holds.get(request.path);
    if (hold) await hold.promise;
    try {
      const [data, changed] = await this.answer(request.path, request.input);
      return { ok: true, data, changed };
    } catch (error) {
      if (!(error instanceof RemoteError)) throw error;
      return {
        ok: false,
        error: {
          code: -32603,
          message: error.message,
          data: { code: error.code, message: error.message, data: error.data },
        },
        changed: [],
      };
    }
  }

  /** The open workspace's tasks: those set for it, or one task naming the workspace and route. */
  tasksOf(id: WorkspaceId | null = this.open): FakeTasks {
    const open = this.workspaces.find((w) => w.id === id);
    if (!open) throw new RemoteError('no_workspace_open', 'No workspace is open');
    let store = this.taskStores.get(open.id);
    if (!store) {
      store = new FakeTasks([fakeTask(`tsk_${open.id}`, `${open.name} tasks.list`)]);
      this.taskStores.set(open.id, store);
    }
    return store;
  }

  // the tasks routes the pages call, over the open workspace's tasks
  private answerTasks(path: string, args: Record<string, unknown>): [unknown, ChangedEntity[]] {
    const store = this.tasksOf();
    const task = () => {
      const found = store.find(args.id);
      if (!found) throw new RemoteError('not_found', `${String(args.id)} not found`);
      return found;
    };
    const page = <T>(items: T[]) => ({ items, nextCursor: null });
    switch (path) {
      case 'tasks.list':
        return [page(store.list((args.filter ?? {}) as never)), []];
      case 'tasks.get':
        return [task(), []];
      case 'tasks.subtasks':
        return [page(store.subtasks(args.id)), []];
      case 'tasks.updateStatus':
        return [store.patch(task().id, { status: args.status as never }), ['task']];
      case 'tasks.update': {
        const { id, ...fields } = args;
        void id;
        return [store.patch(task().id, fields as never), ['task']];
      }
      case 'tasks.updateProject':
        return [store.patch(task().id, { projectId: args.projectId as never }), ['task']];
      case 'tasks.updateLinks':
        return [store.patch(task().id, args as never), ['task']];
      case 'tasks.updateMany': {
        const ids = args.ids as string[];
        return [ids.map((id) => store.patch(id, args.patch as never)), ['task']];
      }
      case 'tasks.setFavorite':
        return [
          store.patch(task().id, { favoritedAt: args.favorite ? new Date() : null }),
          ['task'],
        ];
      case 'tasks.create':
        return [store.create(args as never), ['task']];
      case 'tasks.createSubtask':
        return [
          store.create({
            ...(args as { title: string }),
            parentTaskId: args.parentTaskId as never,
          }),
          ['task'],
        ];
      case 'archive.archiveTask':
        return [store.patch(task().id, { archivedAt: new Date() }), ['task']];
      case 'archive.archiveTasks':
        return [
          (args.ids as string[]).map((id) => store.patch(id, { archivedAt: new Date() })),
          ['task'],
        ];
      case 'archive.restoreTask': {
        const archived = store.tasks.find((t) => t.id === args.id);
        if (archived) archived.archivedAt = null;
        return [archived, ['task']];
      }
      default:
        return [undefined, []];
    }
  }

  private async answer(path: string, input: unknown): Promise<[unknown, ChangedEntity[]]> {
    const args = (input ?? {}) as Record<string, unknown>;
    if (PAGE_ROUTES.has(path)) return [this.page(path), []];
    if (path.startsWith('tasks.') || path.startsWith('archive.'))
      return this.answerTasks(path, args);
    switch (path) {
      case 'app.version':
        return ['0.0.1', []];
      case 'app.showLogFile':
        return [undefined, []];
      case 'settings.get':
        return [this.appSettings(), []];
      case 'workspaces.current':
        return [this.info(this.open), []];
      case 'workspaces.list': {
        const limit = typeof args.limit === 'number' ? args.limit : 50;
        const start = typeof args.cursor === 'string' ? Number(args.cursor) : 0;
        const items = this.workspaces.slice(start, start + limit).map(strip);
        const next = start + limit < this.workspaces.length ? String(start + limit) : null;
        return [{ items, nextCursor: next }, []];
      }
      case 'workspaces.open':
        return [await this.openWorkspace(args.id as WorkspaceId), ['workspace']];
      case 'workspaces.create': {
        const created = workspace(`wsp_new${++this.created}`, args.name as string, {
          color: args.color as string,
        });
        this.workspaces.push(created);
        return [strip(created), ['workspace']];
      }
      case 'workspaces.importFolder': {
        const result = this.importResult;
        if (result instanceof RemoteError) throw result;
        if (result !== null) this.workspaces.push(result);
        return [result && strip(result), result ? ['workspace'] : []];
      }
      case 'workspaces.delete': {
        const id = args.id as WorkspaceId;
        if (this.open !== id) throw new RemoteError('workspace_not_open', 'Open it first');
        this.open = null;
        this.emit('workspace.changed', { id: null, opening: null });
        this.workspaces.splice(
          this.workspaces.findIndex((w) => w.id === id),
          1,
        );
        return [undefined, ['workspace']];
      }
      case 'workspace.showInFolder':
        return [undefined, []];
      // the sidebar's: nothing favorited, nothing connected
      case 'favorites.list':
        return [{ items: [], nextCursor: null }, []];
      case 'sync.status':
        return [[], []];
      case 'recents.recordView':
        return [undefined, ['recent']];
      default:
        throw new RemoteError('internal', `No route ${path} in the fake main`);
    }
  }

  // core's WorkspaceService.open, with its events
  private async openWorkspace(id: WorkspaceId): Promise<WorkspaceInfo> {
    const target = this.workspaces.find((w) => w.id === id);
    if (!target) throw new RemoteError('not_found', `${id} not found`);
    if (target.missing) {
      throw new RemoteError('workspace_data_missing', 'No workspace data found', {
        workspaceId: id,
      });
    }
    this.emit('workspace.changed', { id: this.open, opening: id });
    const hold = this.holds.get('open');
    if (hold) await hold.promise;
    await Promise.resolve();
    if (this.open !== null) {
      this.open = null;
      this.emit('workspace.changed', { id: null, opening: id });
    }
    if (target.failsAfterClose) {
      this.emit('workspace.changed', { id: null, opening: null });
      throw new RemoteError(target.failsAfterClose, 'Migrating the workspace failed');
    }
    this.open = id;
    target.lastOpenedAt = Date.now();
    this.emit('workspace.changed', { id, opening: null });
    return strip(target);
  }

  // a page's list, for the open workspace: one row naming the workspace and the route
  private page(path: string): unknown {
    const open = this.workspaces.find((w) => w.id === this.open);
    if (!open) throw new RemoteError('no_workspace_open', 'No workspace is open');
    const title = `${open.name} ${path}`;
    const id = `${open.id}-${path}`;
    switch (path) {
      case 'recents.list':
        return {
          items: [{ entityType: 'tasks', entity: { id, title, status: 1 } }],
          nextCursor: null,
        };
      case 'calendars.list':
        return [{ id, name: title }];
      case 'integrations.list':
        return [{ id, provider: 'linear', accountLabel: title }];
      default:
        return { items: [{ id, title }], nextCursor: null };
    }
  }
}

function strip(workspace: FakeWorkspace): WorkspaceInfo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { missing, failsAfterClose, ...info } = workspace;
  return info;
}
