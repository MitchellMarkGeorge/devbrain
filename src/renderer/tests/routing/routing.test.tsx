// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskId } from '@common/ids';
import {
  at,
  failure,
  initialContext,
  MainError,
  none,
  open,
  opening,
  renderApp,
  settings,
  splashShown,
  unmountAll,
  waitFor,
  workspace,
} from './harness';

// The window over a fake main: what it shows for each workspace state, where the app lands,
// not-found, search params, and back and forward.

const work = workspace('Work');
const home = workspace('Home', { color: '#2b7fff' });

afterEach(() => unmountAll());

describe('startup', () => {
  it('shows Welcome while no workspace is open, with no splash', async () => {
    const app = renderApp();
    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
    expect(at(app)).toBe('/onboarding');
    expect(splashShown()).toBe(false);
  });

  it('shows the splash with the name while main reopens the last workspace, then its landing page', async () => {
    const started = Date.now();
    const app = renderApp({
      context: initialContext(opening(work), {
        settings: settings({ defaultLandingPage: 'tasks' }),
      }),
    });
    expect(app.text()).toContain('Opening Work…');

    app.push(open(work));
    // held long enough not to flicker
    expect(splashShown()).toBe(true);
    await waitFor(() => expect(app.text()).toContain('Tasks'));
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
    expect(at(app)).toBe('/app/tasks');
    expect(app.history.location.pathname).toBe('/app/tasks');
    // the settings came with the initial load context: no call for them
    expect(app.calls()).not.toContain('settings.get');
  });

  it('reopens the workspace\'s last page when "Reopen last page" is on', async () => {
    const app = renderApp({
      context: initialContext(opening(work), { settings: settings({ openToLastPage: true }) }),
    });
    app.push(open({ ...work, lastPage: '/app/tasks?view=board' }));
    await waitFor(() => expect(at(app)).toBe('/app/tasks?view=board'));
  });

  it("ignores the workspace's last page when the setting is off", async () => {
    const app = renderApp({ context: initialContext(opening(work)) });
    app.push(open({ ...work, lastPage: '/app/tasks?view=board' }));
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('keeps the page a reload was on, with no splash and no call', async () => {
    const app = renderApp({ hash: '/app/notes?view=card', context: initialContext(open(work)) });
    await waitFor(() => expect(app.text()).toContain('Notes'));
    expect(at(app)).toBe('/app/notes?view=card');
    expect(splashShown()).toBe(false);
    expect(app.calls()).not.toContain('workspaces.current');
  });

  it('replaces a location outside the app with the landing page on a reload', async () => {
    const app = renderApp({ hash: '/onboarding', context: initialContext(open(work)) });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    // replaced, not pushed: Back can't return to it
    expect(app.history.length).toBe(1);
  });

  it('shows why the startup open failed, over Welcome', async () => {
    const app = renderApp({
      context: initialContext(none(failure('workspace_too_new', 'Update DevBrain'))),
    });
    await waitFor(() => expect(app.text()).toContain('This workspace needs a newer DevBrain'));
    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
  });

  it('goes to onboarding with the error when the reopen fails', async () => {
    const app = renderApp({ context: initialContext(opening(work)) });
    app.push(none(failure('workspace_migration', 'The migration failed')));
    await waitFor(() => expect(app.text()).toContain('This workspace couldn’t be updated'));
    expect(at(app)).toBe('/onboarding');
  });

  it('follows an open main sent before the page listened, from workspaces.state', async () => {
    const app = renderApp({
      context: initialContext(opening(work)),
      handlers: { 'workspaces.state': () => ({ version: 2, state: open(work) }) },
    });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });

  it('starts at onboarding without an initial load context, then follows main', async () => {
    const app = renderApp({
      context: null,
      handlers: { 'workspaces.state': () => ({ version: 1, state: open(work) }) },
    });
    await waitFor(() => expect(at(app)).toBe('/app/home'));
  });
});

describe('switching workspace', () => {
  const both = { items: [work, home], nextCursor: null };
  const context = (options: Parameters<typeof settings>[0] = {}) =>
    initialContext(open(work), { workspaces: both, settings: settings(options) });

  it("shows the splash, unmounts the old page, and lands on the new workspace's landing page", async () => {
    const app = renderApp({
      hash: '/app/notes',
      context: context({ defaultLandingPage: 'calendar' }),
      handlers: { 'workspaces.list': () => both },
    });
    await waitFor(() => expect(app.text()).toContain('Notes'));

    app.push(opening(home));
    await waitFor(() => expect(app.text()).toContain('Opening Home…'));
    // the page is gone, not under the splash
    expect(app.container.querySelector('[aria-label="Back"]')).toBeNull();
    // the hash still shows Work's page, which main saves for Work as it closes
    expect(app.history.location.pathname).toBe('/app/notes');

    app.push(open(home));
    await waitFor(() => expect(at(app)).toBe('/app/calendar'));
    expect(app.text()).toContain('Home');
  });

  it("lands on the new workspace's own last page", async () => {
    const app = renderApp({
      hash: '/app/tasks?view=board',
      context: context({ openToLastPage: true }),
    });
    await waitFor(() => expect(app.text()).toContain('Tasks'));

    app.push(opening(home));
    app.push(open({ ...home, lastPage: '/app/projects?view=card' }));

    // Home's own last page, not the one Work was on
    await waitFor(() => expect(at(app)).toBe('/app/projects?view=card'));
  });

  it('returns to the old workspace on the page it was on, with a toast, when the new one is missing', async () => {
    const app = renderApp({ hash: '/app/notes', context: context() });
    await waitFor(() => expect(app.text()).toContain('Notes'));

    app.push(opening(home));
    app.push(open(work, failure('workspace_data_missing', 'No workspace data found')));

    await waitFor(() => expect(app.text()).toContain('This workspace’s folder is missing'));
    expect(at(app)).toBe('/app/notes');
  });

  it('goes to onboarding with the error when the open fails after the old one closed', async () => {
    const app = renderApp({ hash: '/app/notes', context: context() });
    await waitFor(() => expect(app.text()).toContain('Notes'));

    app.push(opening(home));
    app.push(none(failure('internal', 'Something went wrong')));

    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
    await waitFor(() => expect(app.text()).toContain('Couldn’t open the workspace'));
  });

  it('goes to onboarding when the open workspace closes', async () => {
    const app = renderApp({ hash: '/app/home', context: context() });
    await waitFor(() => expect(app.text()).toContain('Projects'));

    app.push(none());

    await waitFor(() => expect(app.text()).toContain('Welcome to DevBrain'));
    expect(at(app)).toBe('/onboarding');
    // no error to show
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

describe('not found', () => {
  const context = initialContext(open(work));

  it('shows not-found for a task that no longer exists', async () => {
    const app = renderApp({
      hash: '/app/tasks/tsk_gone',
      context,
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
    const app = renderApp({ hash: '/app/tasks/prj_1', context });
    await waitFor(() => expect(app.text()).toContain('Nothing here'));
    expect(app.calls()).not.toContain('tasks.get');
  });

  it('shows a task page that exists, with its title', async () => {
    const app = renderApp({
      hash: '/app/tasks/tsk_1',
      context,
      handlers: { 'tasks.get': () => ({ id: 'tsk_1' as TaskId, title: 'Write the plan' }) },
    });
    await waitFor(() => expect(app.text()).toContain('Write the plan'));
  });

  it('shows not-found for a path with no page, and Go Home goes to the landing page', async () => {
    const app = renderApp({
      hash: '/app/nowhere',
      context: initialContext(open(work), { settings: settings({ defaultLandingPage: 'notes' }) }),
    });
    await waitFor(() => expect(app.text()).toContain('Nothing here'));
    const goHome = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Go Home',
    );
    goHome?.click();
    await waitFor(() => expect(at(app)).toBe('/app/notes'));
  });
});

describe('search params', () => {
  const context = initialContext(open(work));

  it('keeps the search params of an app page', async () => {
    const app = renderApp({ hash: '/app/calendar?view=month&date=2026-11-06', context });
    await waitFor(() => expect(app.text()).toContain('Calendar'));
    expect(app.router().state.location.search).toEqual({ view: 'month', date: '2026-11-06' });
  });

  it('drops a bad search param to its default, keeping the rest', async () => {
    const app = renderApp({ hash: '/app/tasks?view=nope&status=all', context });
    await waitFor(() => expect(app.text()).toContain('Tasks'));
    const match = app.router().state.matches.find(({ routeId }) => routeId === '/app/tasks/');
    expect(match?.search).toEqual({ view: undefined, status: 'all' });
  });
});

describe('back and forward', () => {
  it("drive the window bar's arrows from the router's history", async () => {
    const app = renderApp({ hash: '/app/home', context: initialContext(open(work)) });
    await waitFor(() => expect(app.text()).toContain('Home'));
    const back = () => app.container.querySelector<HTMLButtonElement>('[aria-label="Back"]');
    const forward = () => app.container.querySelector<HTMLButtonElement>('[aria-label="Forward"]');
    expect(back()?.disabled).toBe(true);

    await app.router().navigate({ to: '/app/notes' });
    await waitFor(() => expect(back()?.disabled).toBe(false));
    expect(forward()?.disabled).toBe(true);

    back()?.click();
    await waitFor(() => expect(at(app)).toBe('/app/home'));
    await waitFor(() => expect(forward()?.disabled).toBe(false));
  });
});

describe('DevBrain unavailable', () => {
  it('shows only the error screen', async () => {
    const app = renderApp({ context: initialContext(none(), { devBrainAvailable: false }) });
    await waitFor(() => expect(app.text()).toContain('couldn’t open its data folder'));
    // not even workspaces.state
    expect(app.calls()).toEqual([]);
  });
});
