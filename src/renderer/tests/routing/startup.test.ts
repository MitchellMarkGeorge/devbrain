// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { SPLASH_MINIMUM_MS } from '../../router';
import { FakeMain, workspace } from './fake-main';
import {
  byText,
  click,
  eventually,
  expectSplashThenPage,
  splashOf,
  startApp,
  stopApps,
  watchDom,
} from './harness';

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;

function twoWorkspaces(open: WorkspaceId | null = null) {
  return new FakeMain([workspace(WORK, 'Work'), workspace(HOME, 'Home')], open);
}

afterEach(() => stopApps());

describe('startup', () => {
  it("opens the workspace main's URL names, under the splash, on its landing page", async () => {
    const main = twoWorkspaces();
    const app = startApp(main, { url: `/app/${WORK}` });
    const dom = watchDom(app.container, ['Opening Work…', 'Work recents.list']);
    await eventually(() => expect(app.text()).toContain('Work recents.list'));
    // the splash, then the page, never the page under or before it
    expectSplashThenPage(dom.log, 'Work recents.list');
    expect(dom.log.some((entry) => entry.what === 'Opening Work…')).toBe(true);
    expect(app.path()).toBe(`/app/${WORK}/home`);
    expect(splashOf(app.container)).toBeNull();
    expect(main.callsTo('workspaces.open')).toEqual([
      { path: 'workspaces.open', input: { id: WORK }, open: null },
    ]);
  });

  it('shows the splash for at least 600ms, however quick the open', async () => {
    const main = twoWorkspaces();
    const app = startApp(main, { url: `/app/${WORK}`, splashMinimumMs: SPLASH_MINIMUM_MS });
    const dom = watchDom(app.container, ['Work recents.list']);
    await eventually(() => expect(app.text()).toContain('Work recents.list'), 2000);
    dom.flush();
    const shown = dom.log.find((entry) => entry.what === 'splash+')!.at;
    const hidden = [...dom.log].reverse().find((entry) => entry.what === 'splash-')!.at;
    expect(hidden - shown).toBeGreaterThanOrEqual(SPLASH_MINIMUM_MS - 20);
    expectSplashThenPage(dom.log, 'Work recents.list');
  });

  it("with Reopen last page on, main's URL is the last page itself, and the app starts there", async () => {
    const main = twoWorkspaces();
    main.settings.openToLastPage = true;
    const app = startApp(main, { url: `/app/${WORK}/notes` });
    await eventually(() => expect(app.text()).toContain('Work notes.list'));
    expect(app.path()).toBe(`/app/${WORK}/notes`);
    expect(main.callsTo('workspaces.open')).toHaveLength(1);
  });

  it("with Reopen last page on, the workspace's link goes to its last page", async () => {
    const main = new FakeMain([
      workspace(WORK, 'Work', { lastPage: `/app/${WORK}/calendar` }),
      workspace(HOME, 'Home'),
    ]);
    main.settings.openToLastPage = true;
    const app = startApp(main, { url: `/app/${WORK}` });
    await eventually(() => expect(app.text()).toContain('Work calendars.list'));
    expect(app.path()).toBe(`/app/${WORK}/calendar`);
  });

  it('with Reopen last page off, the link goes to the landing page, whatever the last page', async () => {
    const main = new FakeMain([workspace(WORK, 'Work', { lastPage: `/app/${WORK}/calendar` })]);
    main.settings.defaultLandingPage = 'tasks';
    const app = startApp(main, { url: `/app/${WORK}` });
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    expect(app.path()).toBe(`/app/${WORK}/tasks`);
  });

  it('with no last workspace, starts on Welcome, opening nothing', async () => {
    const main = twoWorkspaces();
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Welcome to DevBrain'));
    expect(app.text()).toContain('Recent workspaces');
    expect(app.text()).toContain('Work');
    expect(main.callsTo('workspaces.open')).toEqual([]);
    expect(splashOf(app.container)).toBeNull();
  });

  it('with no workspaces at all, Welcome offers Create and Open Existing Folder only', async () => {
    const main = new FakeMain([]);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Create Workspace'));
    expect(app.text()).toContain('Open Existing Folder…');
    expect(app.text()).not.toContain('Recent workspaces');
  });

  it('on a reload keeps the page, reopening nothing', async () => {
    const main = twoWorkspaces(WORK);
    const app = startApp(main, { url: `/app/${WORK}/tasks` });
    const dom = watchDom(app.container, []);
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    expect(app.path()).toBe(`/app/${WORK}/tasks`);
    expect(main.callsTo('workspaces.open')).toEqual([]);
    // the splash shows while the first page loads, as at every start, and only that once
    expect(dom.log.filter((entry) => entry.what === 'splash+')).toHaveLength(1);
    expect(splashOf(app.container)).toBeNull();
  });

  it('without an initial load context, asks main which workspace is open before opening one', async () => {
    const main = twoWorkspaces(WORK);
    const app = startApp(main, { url: `/app/${WORK}/tasks`, initialLoadContext: null });
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    expect(main.callsTo('workspaces.current').length).toBeGreaterThan(0);
    expect(main.callsTo('workspaces.open')).toEqual([]);
  });

  it("shows why when DevBrain couldn't open its data folder, with the log file", async () => {
    const main = new FakeMain([]);
    const app = startApp(main, {
      url: '/onboarding',
      initialLoadContext: { ...main.initialLoadContext(), devBrainAvailable: false },
    });
    await eventually(() => expect(app.text()).toContain('DevBrain couldn’t open its data folder'));
    click(byText(app.container, 'button', 'Show Log File'));
    await eventually(() => expect(main.callsTo('app.showLogFile')).toHaveLength(1));
    // nothing that needs DevBrain ran
    expect(main.callsTo('workspaces.list')).toEqual([]);
  });

  it('shows not found for a URL that names no workspace, or no page in one', async () => {
    const main = twoWorkspaces(WORK);
    const app = startApp(main, { url: '/app/not-a-workspace/home' });
    await eventually(() => expect(app.text()).toContain('There’s no'));
    expect(main.callsTo('workspaces.open')).toEqual([]);

    await app.router.navigate({ href: `/app/${WORK}/nowhere` });
    await eventually(() => expect(app.text()).toContain('There’s nothing here'));
    // inside the shell, with its sidebar
    expect(app.text()).toContain('Integrations');
  });
});
