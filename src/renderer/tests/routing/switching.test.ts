// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { SPLASH_MINIMUM_MS } from '../../pages/root/use-splash';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, splashOf, startApp, stopApps, watchDom } from './harness';

// Switching workspaces is navigating to a page of another workspace (docs/renderer/routing.md).

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;
const SIDE = 'wsp_side' as WorkspaceId;

function main3(open: WorkspaceId | null = WORK) {
  return new FakeMain(
    [workspace(WORK, 'Work'), workspace(HOME, 'Home'), workspace(SIDE, 'Side')],
    open,
  );
}

/** The app on Work's tasks page, reloaded: Work open, the page drawn. */
async function onWorkTasks(main = main3(), options: { splashMinimumMs?: number } = {}) {
  const app = startApp(main, { url: `/app/${WORK}/tasks`, ...options });
  await eventually(() => expect(app.text()).toContain('Work tasks.list'));
  return app;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => stopApps());

describe('a switch', () => {
  it("never draws the old page once it starts, and holds the splash until the new page's slow loader is done", async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    const release = main.hold('notes.list');
    const dom = watchDom(app.container, ['Work tasks.list', 'Home notes.list']);
    const tasksCallsBefore = main.callsTo('tasks.list').length;

    const navigation = app.router.navigate({
      to: '/app/$workspaceId/notes',
      params: { workspaceId: HOME },
    });
    await eventually(() => expect(main.open).toBe(HOME));
    await eventually(() => expect(main.callsTo('notes.list')).toHaveLength(1));
    await tick();
    // Home is open and its page's loader waits: the splash is up, and the old page is gone
    expect(splashOf(app.container)?.textContent).toContain('Opening Home…');
    expect(app.text()).not.toContain('Work tasks.list');

    release();
    await navigation;
    await eventually(() => expect(app.text()).toContain('Home notes.list'));
    expect(splashOf(app.container)).toBeNull();
    dom.flush();
    // after the splash came up, Work's page was never added again, and Home's came last
    const after = dom.after('splash+').map((entry) => entry.what);
    expect(after).not.toContain('Work tasks.list');
    expect(after.at(-1)).toBe('Home notes.list');
    // and Work's page never refetched (with Home's data) once the switch started
    expect(main.callsTo('tasks.list')).toHaveLength(tasksCallsBefore);
    expect(main.callsTo('tasks.list').every((call) => call.open === WORK)).toBe(true);
    expect(app.path()).toBe(`/app/${HOME}/notes`);
  });

  it('shows the splash for at least 600ms, however quick the open', async () => {
    const main = main3();
    const app = await onWorkTasks(main, { splashMinimumMs: SPLASH_MINIMUM_MS });
    const dom = watchDom(app.container, ['Home recents.list']);
    const started = Date.now();
    await app.router.navigate({ to: '/app/$workspaceId', params: { workspaceId: HOME } });
    // the open and the page's loaders are done well before
    expect(Date.now() - started).toBeLessThan(SPLASH_MINIMUM_MS);
    expect(splashOf(app.container)).not.toBeNull();
    await eventually(() => expect(app.text()).toContain('Home recents.list'), 2000);
    dom.flush();
    const shown = dom.log.find((entry) => entry.what === 'splash+')!.at;
    const hidden = [...dom.log].reverse().find((entry) => entry.what === 'splash-')!.at;
    expect(hidden - shown).toBeGreaterThanOrEqual(SPLASH_MINIMUM_MS - 5);
  });

  it("from the sidebar's workspace menu: navigates to the workspace's link", async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    click(app.container.querySelector('[aria-label="Workspace: Work"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitemradio"]', 'Side')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitemradio"]', 'Side'));
    await eventually(() => expect(app.text()).toContain('Side recents.list'));
    expect(app.path()).toBe(`/app/${SIDE}/home`);
    expect(main.open).toBe(SIDE);
    expect(app.text()).toContain('Side');
  });

  it('Back and Forward across a switch reopen each workspace on its page', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    await app.router.navigate({ to: '/app/$workspaceId/notes', params: { workspaceId: HOME } });
    await eventually(() => expect(app.text()).toContain('Home notes.list'));

    app.router.history.back();
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    expect(main.open).toBe(WORK);
    expect(app.path()).toBe(`/app/${WORK}/tasks`);

    app.router.history.forward();
    await eventually(() => expect(app.text()).toContain('Home notes.list'));
    expect(main.open).toBe(HOME);
    expect(main.callsTo('workspaces.open').map((call) => call.input)).toEqual([
      { id: HOME },
      { id: WORK },
      { id: HOME },
    ]);
  });

  it('rapid Back and Forward ends with the last navigation’s workspace open, on its page', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    await app.router.navigate({ to: '/app/$workspaceId/notes', params: { workspaceId: HOME } });
    await app.router.navigate({ to: '/app/$workspaceId/trash', params: { workspaceId: SIDE } });
    await eventually(() => expect(app.text()).toContain('Side archive.listArchived'));

    // each open waits until released, so the navigations pile up
    const release = main.hold('open');
    app.router.history.back(); // Home
    app.router.history.back(); // Work
    app.router.history.forward(); // Home
    await tick();
    release();
    await eventually(() => expect(app.text()).toContain('Home notes.list'));
    await tick();
    expect(main.open).toBe(HOME);
    expect(app.path()).toBe(`/app/${HOME}/notes`);
    expect(splashOf(app.container)).toBeNull();
  });

  it('within a workspace shows the pending page for a slow page, never the splash', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    const release = main.hold('notes.list');
    const navigation = app.router.navigate({
      to: '/app/$workspaceId/notes',
      params: { workspaceId: WORK },
    });
    await eventually(() =>
      expect(app.container.querySelector('[data-testid="page-pending"]')).not.toBeNull(),
    );
    expect(splashOf(app.container)).toBeNull();
    release();
    await navigation;
    await eventually(() => expect(app.text()).toContain('Work notes.list'));
    expect(app.container.querySelector('[data-testid="page-pending"]')).toBeNull();
  });

  it('within a workspace never opens it again, and shows no splash', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    const dom = watchDom(app.container, []);
    await app.router.navigate({ to: '/app/$workspaceId/notes', params: { workspaceId: WORK } });
    await eventually(() => expect(app.text()).toContain('Work notes.list'));
    expect(main.callsTo('workspaces.open')).toEqual([]);
    expect(dom.log).toEqual([]);
  });
});

describe('preloads', () => {
  it("never open a workspace, nor run its pages' loaders", async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    const before = main.calls.length;
    await app.router.preloadRoute({
      to: '/app/$workspaceId/notes',
      params: { workspaceId: HOME },
    });
    await app.router.preloadRoute({ to: '/app/$workspaceId', params: { workspaceId: HOME } });
    await tick();
    expect(main.calls.slice(before)).toEqual([]);
    expect(main.open).toBe(WORK);
    expect(splashOf(app.container)).toBeNull();
  });

  it('within the open workspace prime its pages', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    await app.router.preloadRoute({ to: '/app/$workspaceId/notes', params: { workspaceId: WORK } });
    expect(main.callsTo('notes.list')).toEqual([
      { path: 'notes.list', input: { limit: 50 }, open: WORK },
    ]);
  });

  it('hovering a sidebar link preloads its page', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    const link = byText(app.container, 'a', 'Projects')!;
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await eventually(() => expect(main.callsTo('projects.list')).toHaveLength(1));
  });
});

describe('changes that come from no navigation', () => {
  it('deleting the open workspace sends the window to onboarding', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    await (await import('../../ipc')).ipc.workspaces.delete.mutate({ id: WORK });
    await eventually(() => expect(app.text()).toContain('Welcome to DevBrain'));
    expect(app.path()).toBe('/onboarding');
    // Work has gone from the list (its tile's letter, then its name)
    expect(app.text()).not.toContain('WWork');
  });

  it('a workspace opened elsewhere (another window, the menu) brings the window to it', async () => {
    const main = main3();
    const app = await onWorkTasks(main);
    await main.openElsewhere(SIDE);
    await eventually(() => expect(app.text()).toContain('Side recents.list'));
    expect(app.path()).toBe(`/app/${SIDE}/home`);
    // already open: the window didn't open it again
    expect(main.callsTo('workspaces.open')).toEqual([]);
  });

  it('Back to onboarding while a workspace is open stays in the workspace', async () => {
    const main = main3(null);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Recent workspaces'));
    click(byText(app.container, 'button', 'Home'));
    await eventually(() => expect(app.text()).toContain('Home recents.list'));
    app.router.history.back();
    await eventually(() => expect(app.path()).toBe(`/app/${HOME}/home`));
    expect(app.text()).toContain('Home recents.list');
  });
});
