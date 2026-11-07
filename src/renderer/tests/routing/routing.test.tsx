// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
import type { InitialLoadContext } from '@common/ipc/types';
import {
  at,
  initialContext,
  MainError,
  renderApp,
  settings,
  unmountAll,
  waitFor,
  workspace,
} from './harness';

// The route tree over memory history and a fake main: startup, the guards, not-found, the window
// following the open workspace, and back and forward.

const work = workspace('Work');
const home = workspace('Home', { color: '#2b7fff' });

afterEach(() => unmountAll());

const open = (context: Partial<InitialLoadContext> = {}) =>
  initialContext({ current: work, workspaces: { items: [work], nextCursor: null }, ...context });

describe('startup', () => {
  // main reopening Work as the page loads
  const reopening = (context: Partial<InitialLoadContext> = {}) =>
    initialContext({ opening: work, workspaces: { items: [work], nextCursor: null }, ...context });

  it('goes to Welcome when there is no workspace to reopen, with no splash', async () => {
    const app = renderApp();
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
  });

  it('shows the splash while main reopens the last workspace, then its landing page', async () => {
    const app = renderApp({
      context: reopening({ settings: settings({ defaultLandingPage: 'tasks' }) }),
      handlers: { 'workspaces.current': () => work },
    });
    await waitFor(() => expect(app.text()).toContain('Opening Work…'));
    expect(at(app)).toBe('/');

    app.emit('workspace.changed', { id: work.id, opening: null });
    await waitFor(() => expect(at(app)).toBe('/app/tasks'));
    // the settings came with the initial load context: no call for them
    expect(app.calls()).not.toContain('settings.get');
  });

  it('holds the splash long enough not to flicker', async () => {
    const started = Date.now();
    const app = renderApp({ context: reopening(), handlers: { 'workspaces.current': () => work } });
    await waitFor(() => expect(app.text()).toContain('Opening Work…'));
    app.emit('workspace.changed', { id: work.id, opening: null });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
  });

  it('reopens the workspace\'s last page when "Reopen last page" is on', async () => {
    const app = renderApp({
      context: reopening({ settings: settings({ openToLastPage: true }) }),
      handlers: { 'workspaces.current': () => ({ ...work, lastPage: '/app/tasks?view=board' }) },
    });
    app.emit('workspace.changed', { id: work.id, opening: null });
    await waitFor(() => expect(at(app)).toBe('/app/tasks?view=board'));
  });

  it("ignores the workspace's last page when the setting is off", async () => {
    const app = renderApp({
      context: reopening(),
      handlers: { 'workspaces.current': () => ({ ...work, lastPage: '/app/tasks?view=board' }) },
    });
    app.emit('workspace.changed', { id: work.id, opening: null });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('goes straight to the landing page on a reload, with no splash and no call', async () => {
    const app = renderApp({ context: open() });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    expect(app.calls()).not.toContain('workspaces.current');
  });

  it('follows an open that finished before the page listened, as main says', async () => {
    const app = renderApp({
      context: reopening(),
      handlers: {
        'workspaces.status': () => ({ id: work.id, opening: null }),
        'workspaces.current': () => work,
      },
    });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('goes to onboarding when the reopen fails', async () => {
    const app = renderApp({ context: reopening() });
    await waitFor(() => expect(app.text()).toContain('Opening Work…'));
    app.emit('workspace.changed', { id: null, opening: null });
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
  });

  it("says why main's startup open failed, over onboarding", async () => {
    const app = renderApp({
      context: initialContext({
        openFailure: { code: 'workspace_too_new', message: 'Update DevBrain', data: {} },
      }),
    });
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
    await waitFor(() => expect(app.text()).toContain('This workspace needs a newer DevBrain'));
  });
});

describe('the guards', () => {
  it('send /app to onboarding while no workspace is open', async () => {
    const app = renderApp({ at: '/app/tasks' });
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
  });

  it('send onboarding into the app while a workspace is open', async () => {
    const app = renderApp({ at: '/onboarding/new_workspace', context: open() });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('keep the search params of an app page', async () => {
    const app = renderApp({ at: '/app/calendar?view=month&date=2026-11-06', context: open() });
    await waitFor(() => expect(app.text()).toContain('Calendar'));
    expect(app.router.state.location.search).toEqual({ view: 'month', date: '2026-11-06' });
  });

  it('drop a bad search param to its default, keeping the rest', async () => {
    const app = renderApp({ at: '/app/tasks?view=nope&status=all', context: open() });
    await waitFor(() => expect(app.text()).toContain('Tasks'));
    const match = app.router.state.matches.find(({ routeId }) => routeId === '/app/tasks/');
    expect(match?.search).toEqual({ view: undefined, status: 'all' });
  });
});

describe('not found', () => {
  it('shows not-found for a task that no longer exists', async () => {
    const app = renderApp({
      at: '/app/tasks/tsk_gone',
      context: open(),
      handlers: {
        'tasks.get': () => {
          throw new MainError('not_found', 'Task tsk_gone not found');
        },
      },
    });
    await waitFor(() => expect(app.text()).toContain('Nothing here'));
    // inside the app, with its sidebar
    expect(app.text()).toContain('Projects');
  });

  it('shows not-found for an id of the wrong kind, asking main nothing', async () => {
    const app = renderApp({ at: '/app/tasks/prj_1', context: open() });
    await waitFor(() => expect(app.text()).toContain('Nothing here'));
    expect(app.calls()).not.toContain('tasks.get');
  });

  it('shows a task page that exists, with its title', async () => {
    const app = renderApp({
      at: '/app/tasks/tsk_1',
      context: open(),
      handlers: { 'tasks.get': () => ({ id: 'tsk_1' as TaskId, title: 'Write the plan' }) },
    });
    await waitFor(() => expect(app.text()).toContain('Write the plan'));
  });

  it('shows not-found for a path with no page', async () => {
    const app = renderApp({ at: '/app/nowhere', context: open() });
    await waitFor(() => expect(app.text()).toContain('Nothing here'));
  });
});

describe('following the open workspace', () => {
  it("goes to the new workspace's last page when a switch completes", async () => {
    let current = work;
    const app = renderApp({
      at: '/app/tasks?view=board',
      context: open({ settings: settings({ defaultLandingPage: 'notes', openToLastPage: true }) }),
      handlers: { 'workspaces.current': () => current },
    });
    await waitFor(() => expect(app.text()).toContain('Tasks'));

    app.emit('workspace.changed', { id: work.id, opening: home.id });
    app.emit('workspace.changed', { id: null, opening: home.id });
    current = { ...home, lastPage: '/app/projects?view=card' };
    app.emit('workspace.changed', { id: home.id, opening: null });

    // Home's own last page, not the one Work was on
    await waitFor(() => expect(at(app)).toBe('/app/projects?view=card'));
  });

  it('goes to the default landing page after a switch to a workspace with no last page', async () => {
    let current = work;
    const app = renderApp({
      at: '/app/tasks',
      context: open({ settings: settings({ defaultLandingPage: 'notes', openToLastPage: true }) }),
      handlers: { 'workspaces.current': () => current },
    });
    await waitFor(() => expect(app.text()).toContain('Tasks'));

    app.emit('workspace.changed', { id: work.id, opening: home.id });
    app.emit('workspace.changed', { id: null, opening: home.id });
    current = home;
    app.emit('workspace.changed', { id: home.id, opening: null });

    await waitFor(() => expect(at(app)).toBe('/app/notes'));
  });

  it('shows the splash at `/` during a switch, and Back afterwards returns to the page before', async () => {
    let current = work;
    const app = renderApp({
      at: '/app/notes',
      context: open({ workspaces: { items: [work, home], nextCursor: null } }),
      handlers: {
        'workspaces.current': () => current,
        'workspaces.list': () => ({ items: [work, home], nextCursor: null }),
      },
    });
    await waitFor(() => expect(app.text()).toContain('Notes'));

    app.emit('workspace.changed', { id: work.id, opening: home.id });
    await waitFor(() => expect(app.text()).toContain('Opening Home…'));
    expect(at(app)).toBe('/');
    // the page is gone, not under the splash
    expect(app.container.querySelector('[aria-label="Back"]')).toBeNull();

    app.emit('workspace.changed', { id: null, opening: home.id });
    current = home;
    app.emit('workspace.changed', { id: home.id, opening: null });
    await waitFor(() => expect(at(app)).toBe('/app/home'));

    app.router.history.back();
    await waitFor(() => expect(at(app)).toBe('/app/notes'));
  });

  it('goes to onboarding when an open fails, leaving nothing open', async () => {
    const app = renderApp({ at: '/app/tasks', context: open() });
    await waitFor(() => expect(app.text()).toContain('Tasks'));

    app.emit('workspace.changed', { id: work.id, opening: home.id });
    app.emit('workspace.changed', { id: null, opening: home.id });
    app.emit('workspace.changed', { id: null, opening: null });

    await waitFor(() => expect(at(app)).toBe('/onboarding'));
  });

  it('goes to onboarding when a call finds no workspace open, and main agrees', async () => {
    let closed = false;
    const app = renderApp({
      at: '/app/home',
      context: open(),
      handlers: {
        'workspaces.status': () => ({ id: closed ? null : work.id, opening: null }),
        'recents.list': () => {
          closed = true;
          throw new MainError('no_workspace_open');
        },
      },
    });
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
  });

  it('stays when main says a workspace is open after all', async () => {
    const app = renderApp({
      at: '/app/home',
      context: open(),
      handlers: {
        'recents.list': () => {
          throw new MainError('no_workspace_open');
        },
      },
    });
    await waitFor(() => expect(app.calls()).toContain('recents.list'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(at(app)).toBe('/app/home');
  });
});

describe('back and forward', () => {
  it("drive the window bar's arrows from the router's history", async () => {
    const app = renderApp({ at: '/app/home', context: open() });
    await waitFor(() => expect(app.text()).toContain('Home'));
    const back = () => app.container.querySelector<HTMLButtonElement>('[aria-label="Back"]');
    const forward = () => app.container.querySelector<HTMLButtonElement>('[aria-label="Forward"]');
    expect(back()?.disabled).toBe(true);

    await app.router.navigate({ to: '/app/notes' });
    await waitFor(() => expect(back()?.disabled).toBe(false));
    expect(forward()?.disabled).toBe(true);

    back()?.click();
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    await waitFor(() => expect(forward()?.disabled).toBe(false));
  });
});

describe('DevBrain unavailable', () => {
  it('shows only the error screen', async () => {
    const app = renderApp({ context: initialContext({ devBrainAvailable: false }) });
    await waitFor(() => expect(app.text()).toContain('couldn’t open its data folder'));
    expect(app.calls()).not.toContain('workspaces.status');
  });
});
