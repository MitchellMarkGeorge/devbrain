// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { A, B, FakeMain, gate, settings, workspace } from './fake-main';
import { mountApp, type App } from './harness';

// The splash, the router and workspace switches, over a fake main and memory history. A page is
// "drawn" when it is inserted into the DOM or changes there (harness.ts's MutationObserver), which
// is stricter than painted: no frame can show what was never in the DOM.

const WAIT = { timeout: 4000, interval: 5 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let apps: App[] = [];
afterEach(() => {
  apps.forEach((app) => app.unmount());
  apps = [];
});

function mount(main: FakeMain, options?: Parameters<typeof mountApp>[1]) {
  const app = mountApp(main, options);
  apps.push(app);
  return app;
}

// A open on `page` after a reload, its page drawn
async function openOn(main: FakeMain, page: string) {
  main.current = A;
  const app = mount(main, { url: page });
  await expect.poll(() => app.page()?.path, WAIT).toBe(page.split('?')[0]);
  return app;
}

const drawnSince = (app: App, from: number) => app.drawn.slice(from).map((d) => d.what);

describe('a switch', () => {
  it('never draws the old page, and holds the splash until the new page has loaded', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', '/app/tasks')]);
    const app = await openOn(main, '/app/notes');
    expect(app.page()!.text).toContain('Alpha task');
    const from = app.drawn.length;
    const slowLoader = gate();
    main.listGates.set(B, slowLoader.promise);

    const opened = main.open(B);
    // the event's own render: the page is gone and the splash is up
    await expect.poll(() => app.splash(), WAIT).toBe(true);
    expect(app.page()).toBeNull();
    await opened;
    // A's last page is what A showed: the URL was left alone until A closed
    expect(main.workspaces.get(A)!.lastPage).toBe('/app/notes');

    // well past the minimum, the splash waits for B's loader
    await sleep(900);
    expect(app.splash()).toBe(true);
    expect(app.page()).toBeNull();

    slowLoader.open();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/tasks');
    expect(app.splash()).toBe(false);
    expect(app.page()!.text).toContain('Beta task');
    // after the switch began: the splash, then B's page with B's rows, drawn once with its data
    expect(drawnSince(app, from)).toEqual(['splash', '/app/tasks']);
    expect(app.drawn.at(-1)!.text).toBe('Beta task 1Beta task 2');
    expect(app.rootMounts()).toBe(1);
    expect(main.page).toBe('/app/tasks');
  });

  it('shows the splash for 600ms at least', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', null)]);
    const app = await openOn(main, '/app/home');
    const from = app.drawn.length;
    await main.open(B);
    await expect.poll(() => app.page()?.text, WAIT).toContain('Beta');
    const [splash, page] = app.drawn.slice(from);
    expect([splash.what, page.what]).toEqual(['splash', '/app/home']);
    expect(page.at - splash.at).toBeGreaterThanOrEqual(595);
  });

  it('lands B on its default page with "Reopen last page" off', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', '/app/tasks')]);
    main.settings = settings({ openToLastPage: false, defaultLandingPage: 'notes' });
    const app = await openOn(main, '/app/home');
    await main.open(B);
    await expect.poll(() => app.page()?.text, WAIT).toContain('Beta');
    expect(app.page()!.path).toBe('/app/notes');
  });
});

describe('startup', () => {
  it('reopens the last workspace on its last page with the setting on', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', '/app/tasks?limit=50')]);
    main.lastWorkspaceId = A;
    const app = mount(main);
    expect(app.splash()).toBe(false); // not rendered yet: React renders on the next tick
    await expect.poll(() => app.splash(), WAIT).toBe(true);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/tasks');
    expect(app.router.state.location.href).toBe('/app/tasks?limit=50');
    expect(app.drawn.map((d) => d.what)).toEqual(['splash', '/app/tasks']);
    // Back has nowhere to go: the empty start entry isn't a page of A's
    expect(app.container.querySelector<HTMLButtonElement>('[data-back]')!.disabled).toBe(true);
  });

  it('opens on the default landing page with the setting off', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', '/app/tasks')]);
    main.lastWorkspaceId = A;
    main.settings = settings({ openToLastPage: false, defaultLandingPage: 'notes' });
    const app = mount(main);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/notes');
  });

  it('shows onboarding when there is no workspace to reopen', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    const app = mount(main);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
    expect(app.page()!.text).toContain('Alpha');
  });
});

describe('a reload', () => {
  it('keeps the page in the URL, and reopens nothing', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', '/app/home')]);
    const first = await openOn(main, '/app/home');
    await first.router.navigate({ to: '/app/notes', search: {} });
    await expect.poll(() => first.page()?.path, WAIT).toBe('/app/notes');
    const href = first.history.location.href;
    first.unmount();
    apps = [];
    const sent = main.sent.length;

    // its data arrives before React's first render: the page is drawn at once, with no splash
    const app = mount(main, { url: href });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/notes');
    expect(app.drawn.map((d) => d.what)).toEqual(['/app/notes']);
    expect(main.sent.length).toBe(sent);
  });

  it('with a slow loader, shows the splash until the page is ready', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    main.current = A;
    const slowLoader = gate();
    main.listGates.set(A, slowLoader.promise);
    const app = mount(main, { url: '/app/tasks' });
    await expect.poll(() => app.splash(), WAIT).toBe(true);
    await sleep(700);
    expect(app.page()).toBeNull();
    slowLoader.open();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/tasks');
    expect(app.drawn.map((d) => d.what)).toEqual(['splash', '/app/tasks']);
    expect(app.page()!.text).toContain('Alpha task');
  });
});

describe('a failed open, and a close', () => {
  it('a failed switch saves the old page and shows onboarding, saying which failed', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', null)]);
    const app = await openOn(main, '/app/tasks');
    const from = app.drawn.length;
    main.failOpen = true;
    await expect(main.open(B)).rejects.toThrow();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
    expect(app.container.querySelector('[data-failed]')?.getAttribute('data-failed')).toBe(B);
    expect(main.workspaces.get(A)!.lastPage).toBe('/app/tasks');
    expect(drawnSince(app, from)).toEqual(['splash', '/onboarding']);
  });

  it('a failed reopen at startup shows onboarding', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    main.lastWorkspaceId = A;
    main.failOpen = true;
    const app = mount(main);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
  });

  it('a workspace closing takes its page away and shows onboarding', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    const app = await openOn(main, '/app/notes');
    const from = app.drawn.length;
    main.closeWorkspace();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
    expect(drawnSince(app, from)).toEqual(['splash', '/onboarding']);
    expect(main.workspaces.get(A)!.lastPage).toBe('/app/notes');
  });
});

describe('back and forward', () => {
  async function switched() {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', null)]);
    const app = await openOn(main, '/app/notes');
    await app.router.navigate({ to: '/app/tasks' });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/tasks');
    await main.open(B);
    await expect.poll(() => app.page()?.text, WAIT).toContain('Beta');
    return { main, app, from: app.drawn.length };
  }

  it('Back stops at the first page of the open workspace', async () => {
    const { app, from } = await switched();
    const back = app.container.querySelector<HTMLButtonElement>('[data-back]')!;
    expect(back.disabled).toBe(true);
    back.click();
    await sleep(50);
    expect(app.page()!.path).toBe('/app/home');
    expect(drawnSince(app, from)).toEqual([]);

    // within B, Back works
    await app.router.navigate({ to: '/app/notes' });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/notes');
    const enabled = app.container.querySelector<HTMLButtonElement>('[data-back]')!;
    expect(enabled.disabled).toBe(false);
    enabled.click();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');
  });

  it("history moved past it anyway lands on B's first page, never on A's", async () => {
    const { app, from } = await switched();
    // entries: A /app/notes, A /app/tasks, B /app/home
    app.router.history.back();
    await sleep(100);
    app.router.history.go(-1);
    await sleep(100);
    app.router.history.forward();
    await sleep(100);
    app.router.history.forward();
    await sleep(100);
    expect(app.page()!.path).toBe('/app/home');
    expect(app.page()!.text).toContain('Beta');
    // the redirects land on B's home, which is already drawn: nothing new is
    expect(drawnSince(app, from).filter((what) => what !== '/app/home')).toEqual([]);
    expect(app.drawn.slice(from).every((d) => d.text.includes('Beta'))).toBe(true);
  });

  it('nothing navigated during the switch shows: the landing wins', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', null)]);
    const app = await openOn(main, '/app/notes');
    await app.router.navigate({ to: '/app/tasks' });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/tasks');
    const from = app.drawn.length;
    const slowOpen = gate();
    main.openGate = slowOpen.promise;
    const opened = main.open(B);
    await expect.poll(() => app.splash(), WAIT).toBe(true);
    app.router.history.back();
    await sleep(50);
    slowOpen.open();
    await opened;
    await expect.poll(() => app.page()?.text, WAIT).toContain('Beta');
    expect(app.page()!.path).toBe('/app/home');
    expect(drawnSince(app, from)).toEqual(['splash', '/app/home']);
  });
});
