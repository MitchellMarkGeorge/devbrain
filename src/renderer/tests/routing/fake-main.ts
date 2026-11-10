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
import {
  LinkState,
  type AppSettings,
  type SearchCounts,
  type SearchResult,
  type Event,
  type Integration,
  type WorkspaceInfo,
} from '@common/types';
import { fakeCalendar, FakeCalendar } from './fake-calendar';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';

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
  // each workspace's tasks, projects and notes; a workspace without any lists one task and one
  // note naming it
  readonly taskStores = new Map<WorkspaceId, FakeTasks>();
  // what search.search finds, whatever the query: those of the types asked for
  searchResults: SearchResult[] = [];
  // what search.counts answers; counted from searchResults when null
  searchCounts: SearchCounts | null = null;
  // the events of a workspace with no calendar store of its own (its one calendar, cal_work), and
  // what events.create adds there
  readonly calendarEvents: Event[] = [];
  // the integrations, over the one-row page every list route answers by default
  integrations: Integration[] | null = null;
  // projects.list answers with the open workspace's own projects, even none, rather than the
  // one-row page
  storeProjects = false;
  // the calendar settings the calendar page reads
  calendarSettings: AppSettings['calendar'] = {
    defaultEventDuration: '30m',
    firstDayOfWeek: 'monday',
    defaultView: 'week',
    hideWeekends: false,
  };
  // each workspace's calendars and events; a workspace without any has one calendar naming it
  readonly calendarStores = new Map<WorkspaceId, FakeCalendar>();
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
    return {
      theme: 'system',
      general: this.settings,
      tasks: this.taskSettings,
      calendar: this.calendarSettings,
    } as AppSettings;
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

  /** The open workspace's tasks and notes: those set for it, or one of each naming the workspace. */
  tasksOf(id: WorkspaceId | null = this.open): FakeTasks {
    const open = this.workspaces.find((w) => w.id === id);
    if (!open) throw new RemoteError('no_workspace_open', 'No workspace is open');
    let store = this.taskStores.get(open.id);
    if (!store) {
      store = new FakeTasks(
        [fakeTask(`tsk_${open.id}`, `${open.name} tasks.list`)],
        [],
        [fakeNote(`nte_${open.id}`, `${open.name} notes.list`)],
      );
      this.taskStores.set(open.id, store);
    }
    return store;
  }

  /**
   * The open workspace's calendars: those set for it, or one calendar naming the workspace whose
   * events are `calendarEvents`.
   */
  calendarOf(id: WorkspaceId | null = this.open): FakeCalendar {
    const open = this.workspaces.find((w) => w.id === id);
    if (!open) throw new RemoteError('no_workspace_open', 'No workspace is open');
    let store = this.calendarStores.get(open.id);
    if (!store) {
      store = new FakeCalendar(
        [fakeCalendar('cal_work', `${open.name} calendars.list`)],
        this.calendarEvents,
      );
      this.calendarStores.set(open.id, store);
    }
    return store;
  }

  // the calendar routes the calendar page calls, over the open workspace's calendars
  private answerCalendar(path: string, args: Record<string, unknown>): [unknown, ChangedEntity[]] {
    const store = this.calendarOf();
    const event = () => {
      const found = store.find(args.id);
      if (!found) throw new RemoteError('not_found', `${String(args.id)} not found`);
      return found;
    };
    const { id, seriesId, originalStartAt, scope, ...fields } = args;
    void id;
    switch (path) {
      case 'calendars.list':
        return [store.calendars, []];
      case 'calendars.setVisible':
        return [store.setVisible(args.id, args.visible as boolean), ['calendar']];
      case 'events.listForCalendar':
        return [
          store.listForCalendar(
            args.start as Date,
            args.end as Date,
            args.calendarIds as string[] | undefined,
          ),
          [],
        ];
      case 'events.get':
        return [event(), []];
      case 'events.create':
        return [store.create(args as never), ['event']];
      case 'events.update':
        return [store.update(event().id, fields as never), ['event']];
      case 'events.updateOccurrence':
        return [
          store.updateOccurrence(
            seriesId,
            originalStartAt as Date,
            scope as 'this' | 'following',
            fields as never,
          ),
          ['event'],
        ];
      case 'events.delete':
        store.delete(event().id);
        return [undefined, ['event']];
      case 'events.deleteOccurrence':
        store.deleteOccurrence(seriesId, originalStartAt as Date);
        return [undefined, ['event']];
      default:
        throw new RemoteError('internal', `No route ${path} in the fake main`);
    }
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
      case 'tasks.list': {
        const items = store.list((args.filter ?? {}) as never);
        return [page(typeof args.limit === 'number' ? items.slice(0, args.limit) : items), []];
      }
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
      case 'tasks.promote':
        return [store.patch(task().id, { parentTaskId: null, parentTask: null }), ['task']];
      case 'tasks.demote':
        return [store.patch(task().id, { parentTaskId: args.parentTaskId as never }), ['task']];
      case 'tasks.detach':
      case 'tasks.reattach': {
        const found = task();
        const state = path === 'tasks.detach' ? LinkState.DETACHED : LinkState.SYNCED;
        return [
          store.patch(found.id, { external: found.external && { ...found.external, state } }),
          ['task'],
        ];
      }
      case 'archive.archiveNote':
        return [store.patchNote(args.id, { archivedAt: new Date() }), ['note']];
      case 'archive.restoreNote':
        return [store.patchNote(args.id, { archivedAt: null }), ['note']];
      case 'tasks.duplicate': {
        const { id, ...fields } = task();
        void id;
        return [
          store.create({ ...fields, title: `Copy of ${fields.title}`, favoritedAt: null }),
          ['task'],
        ];
      }
      case 'tasks.toMarkdown':
        return [`# ${task().title}\n`, []];
      case 'tasks.convertToProject': {
        const found = task();
        store.patch(found.id, { archivedAt: new Date() });
        const project = fakeProject(`prj_${found.id.slice(4)}`, found.title);
        store.projects.push(project);
        return [project, ['task', 'project']];
      }
      case 'archive.restoreTask': {
        const archived = store.tasks.find((t) => t.id === args.id);
        if (archived) archived.archivedAt = null;
        return [archived, ['task']];
      }
      default:
        return [undefined, []];
    }
  }

  // the projects routes, over the open workspace's projects and their tasks
  private answerProjects(path: string, args: Record<string, unknown>): [unknown, ChangedEntity[]] {
    const store = this.tasksOf();
    const project = () => {
      const found = store.findProject(args.id);
      if (!found) throw new RemoteError('not_found', `${String(args.id)} not found`);
      return found;
    };
    switch (path) {
      case 'projects.list': {
        const filter = (args.filter ?? {}) as { status?: number; dueBefore?: Date };
        const items = store.projects
          .filter((p) => p.archivedAt === null)
          .filter((p) => filter.status === undefined || p.status === filter.status)
          .filter((p) => !filter.dueBefore || (p.dueDate !== null && p.dueDate < filter.dueBefore))
          .map((p) => ({ ...p, stats: store.statsOf(p.id) }));
        return [{ items, nextCursor: null }, []];
      }
      case 'projects.get':
        return [project(), []];
      case 'projects.stats':
        return [store.statsOf(project().id), []];
      case 'projects.create': {
        const { tasks = [], ...fields } = args as { title: string; tasks?: { title: string }[] };
        const created = store.createProject(fields);
        for (const task of tasks) store.create({ title: task.title, projectId: created.id });
        return [created, tasks.length > 0 ? ['project', 'task'] : ['project']];
      }
      case 'projects.update': {
        const { id, ...fields } = args;
        void id;
        return [Object.assign(project(), fields, { updatedAt: new Date() }), ['project']];
      }
      case 'projects.updateStatus':
        return [Object.assign(project(), { status: args.status }), ['project']];
      case 'projects.setFavorite':
        return [
          Object.assign(project(), { favoritedAt: args.favorite ? new Date() : null }),
          ['project'],
        ];
      case 'archive.archiveProject':
        return [Object.assign(project(), { archivedAt: new Date() }), ['project']];
      default:
        throw new RemoteError('internal', `No route ${path} in the fake main`);
    }
  }

  // a note's routes, over the open workspace's notes (the task note section's)
  private answerNotes(path: string, args: Record<string, unknown>): [unknown, ChangedEntity[]] {
    const store = this.tasksOf();
    const note = () => {
      const found = store.notes.find((n) => n.id === args.id);
      if (!found) throw new RemoteError('not_found', `${String(args.id)} not found`);
      return found;
    };
    switch (path) {
      case 'notes.get':
        return [note(), []];
      case 'notes.readContent':
        return [store.contents.get(note().id) ?? '', []];
      case 'notes.updateContent':
        store.contents.set(note().id, args.content as string);
        return [note(), ['note']];
      case 'notes.update': {
        const { id, ...fields } = args;
        void id;
        return [store.patchNote(note().id, fields as never), ['note']];
      }
      case 'notes.setFavorite':
        return [
          store.patchNote(note().id, { favoritedAt: args.favorite ? new Date() : null }),
          ['note'],
        ];
      case 'notes.showInFolder':
        note();
        return [undefined, []];
      case 'notes.duplicate': {
        const original = note();
        const copy = fakeNote(`nte_new${store.notes.length + 1}`, `Copy of ${original.title}`, {
          projectId: original.projectId,
          project: original.project,
        });
        store.notes.push(copy);
        store.contents.set(copy.id, store.contents.get(original.id) ?? '');
        return [copy, ['note']];
      }
      case 'notes.toMarkdown':
        return [`# ${note().title}\n\n${store.contents.get(note().id) ?? ''}\n`, []];
      case 'notes.create': {
        const created = fakeNote(`nte_new${store.notes.length + 1}`, (args.title as string) ?? '', {
          linkedTaskId: (args.linkedTaskId as never) ?? null,
          projectId: (args.projectId as never) ?? null,
          linkedEventId: (args.linkedEventId as never) ?? null,
        });
        store.notes.push(created);
        store.contents.set(created.id, (args.content as string) ?? '');
        return [created, ['note']];
      }
      default:
        throw new RemoteError('internal', `No route ${path} in the fake main`);
    }
  }

  private async answer(path: string, input: unknown): Promise<[unknown, ChangedEntity[]]> {
    const args = (input ?? {}) as Record<string, unknown>;
    const filter = args.filter as Record<string, unknown> | undefined;
    // the open workspace's notes, filtered as core does
    if (path === 'notes.list') {
      return [{ items: this.tasksOf().listNotes(filter as never), nextCursor: null }, []];
    }
    if (path.startsWith('events.') || path.startsWith('calendars.')) {
      return this.answerCalendar(path, args);
    }
    if (path.startsWith('notes.') && path !== 'notes.list') return this.answerNotes(path, args);
    if (
      (path.startsWith('projects.') || path === 'archive.archiveProject') &&
      this.open !== null &&
      this.taskStores.has(this.open)
    ) {
      return this.answerProjects(path, args);
    }
    const home = this.answerHome(path, args);
    if (home) return home;
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
      case 'workspace.openUrl':
        return [undefined, []];
      case 'search.search': {
        const types = (args.entityType as string[] | undefined) ?? [];
        const found = this.searchResults.filter(
          ({ entityType }) => types.length === 0 || types.includes(entityType),
        );
        return [found, []];
      }
      case 'search.counts': {
        const counts = { task: 0, note: 0, project: 0, event: 0 };
        for (const { entityType } of this.searchResults) counts[entityType] += 1;
        return [this.searchCounts ?? counts, []];
      }
      default:
        throw new RemoteError('internal', `No route ${path} in the fake main`);
    }
  }

  // what Home reads beyond the page routes: a workspace's own projects and notes when it has
  // some, the calendar's events, the integrations set, and project stats
  private answerHome(
    path: string,
    args: Record<string, unknown>,
  ): [unknown, ChangedEntity[]] | undefined {
    const store = this.open ? this.taskStores.get(this.open) : undefined;
    const page = <T>(items: T[]) => ({ items, nextCursor: null });
    switch (path) {
      case 'projects.list': {
        if (!store || (!this.storeProjects && !store.projects.length)) return undefined;
        const dueBefore = (args.filter as { dueBefore?: Date } | undefined)?.dueBefore;
        const projects = store.projects.filter(
          (p) => !dueBefore || (p.dueDate !== null && p.dueDate < dueBefore),
        );
        return [page(projects), []];
      }
      case 'recents.list':
        if (args.entityType !== 'notes' || !store?.notes.length) return undefined;
        return [
          page(
            store.notes.map((note) => ({
              entityType: 'notes',
              entity: note,
              viewedAt: note.updatedAt,
            })),
          ),
          [],
        ];
      case 'integrations.list':
        return this.integrations ? [this.integrations, []] : undefined;
      case 'projects.stats':
        return [
          {
            numOfNotStarted: 0,
            numOfInProgress: 0,
            numOfCompleted: 0,
            numOfCancelled: 0,
            numOfOverdue: 0,
            totalTasks: 0,
          },
          [],
        ];
      default:
        return undefined;
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
      case 'integrations.list':
        return [{ id, provider: 'linear', accountLabel: title, sources: [] }];
      case 'projects.list': {
        const stats = {
          numOfNotStarted: 0,
          numOfInProgress: 0,
          numOfCompleted: 0,
          numOfCancelled: 0,
          numOfOverdue: 0,
          totalTasks: 0,
        };
        return { items: [{ id, title, status: 3, color: null, stats }], nextCursor: null };
      }
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
