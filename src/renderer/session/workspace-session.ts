import { redirect, type AnyRouter, type ParsedLocation } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { InitialLoadContext } from '@common/ipc/types';
import { lastPageSchema, type AppSettings, type WorkspaceInfo } from '@common/types';
import type { AppRouter } from '@main/ipc/router';
import type { EventClient } from '../ipc/events';
import type { QueryInvalidator } from '../ipc/query-invalidator';

// Which workspace the window is in, and the navigations a change of it calls for.
//
// It follows main's `workspace.changed` and owns every navigation the workspace lifecycle makes:
// to a workspace's landing page once it is open, to onboarding once none is. While a workspace is
// opening, and until the page it lands on has loaded, it is `busy`: the root route draws the splash
// instead of its outlet, so the old workspace's page is gone from the first frame of a switch and
// the new one appears only once its loaders are done. The URL is left alone until the new workspace
// is open, so main saves the old one's last page from it as it closes (src/main/runtime/last-page.ts).
//
// Each workspace's pages start at the history entry it landed on (`firstIndex`). Entries before it
// belong to whatever was open before; the root route's `beforeLoad` (`guard`) sends a location
// that does not belong to what is open to its first page.

declare module '@tanstack/history' {
  interface HistoryState {
    // set on the entries the session navigates to: the workspace they belong to (null: none open)
    workspaceId?: WorkspaceId | null;
  }
}

export type SessionPhase =
  // starting, or a workspace is opening: no page belongs, and the guard stands aside
  | 'opening'
  // a workspace is open; its pages are /app/* from history entry `firstIndex` on
  | 'open'
  // none is open: onboarding
  | 'none';

export interface SessionState {
  phase: SessionPhase;
  // the splash shows: opening, or landing on a page whose loaders are still running
  busy: boolean;
  // the open workspace (phase 'open')
  workspace: WorkspaceInfo | null;
  // the workspace opening or being landed on, for the splash to name (kept while the splash is
  // held after); at a cold start, the one being reopened, from main's initial load context
  opening: WorkspaceId | null;
  // where a location that doesn't belong is sent: the page the workspace landed on, or onboarding
  home: string;
  // the history index of the first entry that belongs to what is open
  firstIndex: number;
  // the workspace whose open failed, for onboarding to say so (phase 'none')
  failed: WorkspaceId | null;
}

export interface WorkspaceSessionOptions {
  events: EventClient<AppEvents>;
  ipc: TRPCClient<AppRouter>;
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
  queryInvalidator: Pick<QueryInvalidator, 'workspaceOpened'>;
  // main's context for this page load: a workspace open already means a reload
  initial: InitialLoadContext | null;
  onError?: (error: unknown) => void;
}

const ONBOARDING = '/onboarding';

/**
 * Where a workspace opens: its last page with "Reopen last page" on (when it is a page in the
 * app), its default landing page otherwise.
 */
export function landingPage(settings: AppSettings, workspace: WorkspaceInfo): string {
  const { openToLastPage, defaultLandingPage } = settings.general;
  if (openToLastPage && lastPageSchema.safeParse(workspace.lastPage).success) {
    return workspace.lastPage!;
  }
  return `/app/${defaultLandingPage}`;
}

const isAppPath = (pathname: string) => pathname === '/app' || pathname.startsWith('/app/');

const indexOf = (location: Pick<ParsedLocation, 'state'>) => location.state.__TSR_index;

export class WorkspaceSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  private router: AnyRouter | null = null;
  // the workspace being opened, from `opening` until it is open or has failed
  private opening: WorkspaceId | null = null;
  // what the latest landing is for: a workspace, none (null), or nothing yet (undefined)
  private target: WorkspaceId | null | undefined = undefined;
  // bumped by every transition, so an older one's awaits finish without acting
  private run = 0;

  constructor(private readonly options: WorkspaceSessionOptions) {
    this.state = {
      phase: 'opening',
      busy: true,
      workspace: null,
      opening: options.initial?.last?.id ?? null,
      home: ONBOARDING,
      firstIndex: 0,
      failed: null,
    };
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Starts following main: on a reload, loads the page in the URL; at a cold start, reopens the
   * last workspace. Returns the function that stops.
   */
  start(router: AnyRouter): () => void {
    this.router = router;
    const stop = this.options.events.on('workspace.changed', (change) => this.onChanged(change));
    const current = this.options.initial?.current ?? null;
    if (current) this.resume(current);
    else this.openLast();
    return stop;
  }

  /**
   * For the root route's `beforeLoad`: sends a location that doesn't belong to what is open to
   * its first page, replacing the entry. Stands aside while a workspace is opening.
   */
  guard(location: ParsedLocation): void {
    const { phase, home, workspace } = this.state;
    if (phase === 'opening' || this.belongs(location)) return;
    throw redirect({
      href: home,
      replace: true,
      state: { workspaceId: workspace?.id ?? null },
    });
  }

  /** Whether Back stays within the open workspace's pages. */
  canGoBack(location: Pick<ParsedLocation, 'state'>): boolean {
    return !this.state.busy && indexOf(location) > this.state.firstIndex;
  }

  private belongs(location: ParsedLocation): boolean {
    const { phase, workspace, firstIndex } = this.state;
    if (phase === 'none') return location.pathname.startsWith(ONBOARDING);
    if (!isAppPath(location.pathname)) return false;
    return indexOf(location) >= firstIndex || location.state.workspaceId === workspace?.id;
  }

  private set(next: Partial<SessionState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private onChanged({ id, opening }: AppEvents['workspace.changed']): void {
    if (opening !== null) {
      // the page goes now; the URL stays, for main to save as the old workspace's last page
      this.run++;
      this.opening = opening;
      this.target = undefined;
      this.set({ phase: 'opening', busy: true, workspace: null, opening });
      return;
    }
    if (id === this.target) return;
    const failed = id === null ? this.opening : null;
    void this.land(id, failed);
  }

  // A reload: the URL's page is the open workspace's, unless it isn't one of its pages
  private resume(workspace: WorkspaceInfo): void {
    const router = this.router!;
    const location = router.latestLocation;
    this.target = workspace.id;
    const run = ++this.run;
    this.set({
      phase: 'open',
      workspace,
      home: location.href,
      firstIndex: indexOf(location),
    });
    if (!isAppPath(location.pathname)) {
      void this.land(workspace.id, null);
      return;
    }
    router.load().then(
      () => run === this.run && this.set({ busy: false }),
      (error: unknown) => this.fail(error),
    );
  }

  // A cold start. Main's events say what opens; the answer only matters when none came.
  private openLast(): void {
    const settle = (id: WorkspaceId | null, failed: WorkspaceId | null) => {
      if (this.target === undefined && this.opening === null) void this.land(id, failed);
    };
    this.options.ipc.workspaces.openLast.mutate().then(
      (info) => settle(info?.id ?? null, null),
      (error: unknown) => {
        this.options.onError?.(error);
        settle(null, null);
      },
    );
  }

  // Navigates to where `id` (a workspace now open, or null for none) begins, and stays busy until
  // that page has loaded.
  private async land(id: WorkspaceId | null, failed: WorkspaceId | null): Promise<void> {
    const router = this.router!;
    const run = ++this.run;
    this.target = id;
    this.opening = null;
    // what the splash names until it goes: the workspace landed on (none for onboarding)
    this.set({ busy: true, opening: id });
    try {
      let workspace: WorkspaceInfo | null = null;
      let to = ONBOARDING;
      if (id !== null) {
        const { queryClient, trpc } = this.options;
        const [current, settings] = await Promise.all([
          queryClient.fetchQuery({ ...trpc.workspaces.current.queryOptions(), staleTime: 0 }),
          queryClient.fetchQuery(trpc.settings.get.queryOptions()),
        ]);
        // superseded, or main has moved on: its next event lands
        if (run !== this.run || current?.id !== id) return;
        workspace = current;
        to = landingPage(settings, current);
      }
      // the old workspace's data goes before the new page's loaders fill the cache (the
      // invalidator does this on the event too; this keeps it from depending on listener order)
      await this.options.queryInvalidator.workspaceOpened(id);
      if (run !== this.run) return;
      // a new entry, the first of this workspace's pages: those before it are someone else's
      this.set({
        phase: id === null ? 'none' : 'open',
        workspace,
        home: to,
        firstIndex: indexOf(router.latestLocation) + 1,
        failed,
      });
      await router.navigate({ href: to, state: { workspaceId: id } });
      if (run === this.run) this.set({ busy: false });
    } catch (error) {
      if (run === this.run) this.fail(error);
    }
  }

  // Something the session needed failed: say so, and show onboarding rather than a splash forever
  private fail(error: unknown): void {
    this.options.onError?.(error);
    if (this.target === null) {
      this.set({ busy: false });
      return;
    }
    void this.land(null, this.state.workspace?.id ?? null);
  }
}
