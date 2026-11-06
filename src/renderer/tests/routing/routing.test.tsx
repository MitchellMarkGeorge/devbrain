// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
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

// The route tree over memory history and a fake main: boot, the guards, not-found, the workspace
// following the URL, and the last page saved.

const work = workspace('Work');
const home = workspace('Home', { color: '#2b7fff' });

afterEach(() => unmountAll());

const open = (context = {}) =>
  initialContext({ current: work, workspaces: { items: [work], nextCursor: null }, ...context });

describe('boot', () => {
  it('goes to Welcome when there is no workspace to reopen', async () => {
    const app = renderApp();
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
    expect(app.calls()).toContain('workspaces.openLast');
  });

  it('reopens the last workspace, then lands on the default landing page', async () => {
    const app = renderApp({
      handlers: {
        'workspaces.openLast': () => work,
        'settings.get': () => settings({ defaultLandingPage: 'tasks' }),
      },
    });
    await waitFor(() => expect(at(app)).toBe('/app/tasks'));
    await waitFor(() => expect(app.text()).toContain('Work'));
  });

  it('shows the splash naming the workspace while it reopens, held long enough not to flicker', async () => {
    let finish: (value: typeof work) => void = () => {};
    const started = Date.now();
    const app = renderApp({
      context: initialContext({ last: work }),
      handlers: { 'workspaces.openLast': () => new Promise((resolve) => (finish = resolve)) },
    });
    await waitFor(() => expect(app.text()).toContain('Opening Work…'));
    finish(work);
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
  });

  it('reopens the workspace\'s last page when "Reopen last page" is on', async () => {
    const app = renderApp({
      handlers: {
        'workspaces.openLast': () => ({ ...work, lastPage: '/app/tasks?view=board' }),
        'settings.get': () => settings({ openToLastPage: true }),
      },
    });
    await waitFor(() => expect(at(app)).toBe('/app/tasks?view=board'));
  });

  it("ignores the workspace's last page when the setting is off", async () => {
    const app = renderApp({
      handlers: { 'workspaces.openLast': () => ({ ...work, lastPage: '/app/tasks?view=board' }) },
    });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('skips a reload straight to the landing page, reopening nothing', async () => {
    const app = renderApp({ context: open() });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    expect(app.calls()).not.toContain('workspaces.openLast');
  });

  it('goes to onboarding when the last workspace fails to open', async () => {
    const app = renderApp({
      handlers: {
        'workspaces.openLast': () => {
          throw new MainError('workspace_too_new', 'Update DevBrain to open it');
        },
      },
    });
    await waitFor(() => expect(at(app)).toBe('/onboarding'));
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
      context: open(),
      handlers: {
        'workspaces.current': () => current,
        'settings.get': () => settings({ defaultLandingPage: 'notes', openToLastPage: true }),
      },
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
      context: open(),
      handlers: {
        'workspaces.current': () => current,
        'settings.get': () => settings({ defaultLandingPage: 'notes', openToLastPage: true }),
      },
    });
    await waitFor(() => expect(app.text()).toContain('Tasks'));

    app.emit('workspace.changed', { id: work.id, opening: home.id });
    app.emit('workspace.changed', { id: null, opening: home.id });
    current = home;
    app.emit('workspace.changed', { id: home.id, opening: null });

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

  it('goes to onboarding when a call finds no workspace open', async () => {
    const app = renderApp({
      at: '/app/home',
      context: open(),
      handlers: {
        'recents.list': () => {
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
        'workspaces.current': () => work,
        'recents.list': () => {
          throw new MainError('no_workspace_open');
        },
      },
    });
    await waitFor(() => expect(app.calls()).toContain('workspaces.current'));
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
    expect(app.calls()).not.toContain('workspaces.openLast');
  });
});
