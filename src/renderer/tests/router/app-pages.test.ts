// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, CallError, FakeMain, settings, workspace } from './fake-main';
import { mountApp, type App } from './harness';

// The app shell, onboarding and the DevBrain-unavailable screen over the real route tree and a fake
// main: what each draws, and that every open goes through main, the splash and the session.

const WAIT = { timeout: 4000, interval: 5 };

let apps: App[] = [];
// happy-dom lays nothing out: every element is 0px wide, which AppShell takes for a compact window
// (sidebar in a drawer). Measure the Figma screens' 1440px window instead.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 1440, height: 1024 }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  apps.forEach((app) => app.unmount());
  apps = [];
  document.body.innerHTML = '';
});

function mount(main: FakeMain, url?: string) {
  const app = mountApp(main, { url });
  apps.push(app);
  return app;
}

const byText = (root: ParentNode, selector: string, text: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text)) ??
  null;

const dialog = () => document.querySelector<HTMLElement>('[data-workspace-error]');

async function click(find: () => HTMLElement | null) {
  await expect.poll(find, WAIT).not.toBeNull();
  find()!.click();
}

async function openOn(main: FakeMain, page: string) {
  main.current = A;
  const app = mount(main, page);
  await expect.poll(() => app.page()?.path, WAIT).toBe(page.split('?')[0]);
  return app;
}

describe('the app shell', () => {
  it('draws the sidebar of the open workspace, its pages as links, and the page in the header', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    const app = await openOn(main, '/app/tasks');
    const sidebar = app.container.querySelector('nav')!;
    expect(sidebar.querySelector('[aria-label="Workspace: Alpha"]')).not.toBeNull();
    const tasks = byText(sidebar, 'a', 'Tasks')!;
    expect(tasks.getAttribute('aria-current')).toBe('page');
    expect(tasks.getAttribute('href')).toBe('/app/tasks');
    expect(app.container.querySelector('header')!.textContent).toContain('AlphaTasks');

    byText(sidebar, 'a', 'Notes')!.click();
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/notes');
    expect(byText(sidebar, 'a', 'Notes')!.getAttribute('aria-current')).toBe('page');
    expect(app.page()!.text).toContain('Alpha note 1');
    // Help has nothing behind it yet
    expect(byText(sidebar, 'button', 'Help')!.hasAttribute('disabled')).toBe(true);
  });

  it('sends /app to the default landing page', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    main.settings = settings({ defaultLandingPage: 'projects' });
    const app = await openOn(main, '/app/home');
    await app.router.navigate({ to: '/app' });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/projects');
  });

  it('keeps onboarding out of reach while a workspace is open, and the app while none is', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    const app = await openOn(main, '/app/home');
    await app.router.navigate({ to: '/onboarding/new_workspace' });
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');

    const none = new FakeMain([workspace(A, 'Alpha', null)]);
    const onboarding = mount(none, '/');
    await expect.poll(() => onboarding.page()?.path, WAIT).toBe('/onboarding');
    await onboarding.router.navigate({ to: '/app/tasks' });
    await expect.poll(() => onboarding.page()?.path, WAIT).toBe('/onboarding');
  });

  it('switches workspace from the sidebar menu, naming it on the splash', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', '/app/notes')]);
    const app = await openOn(main, '/app/home');
    await click(() => app.container.querySelector('[aria-label="Workspace: Alpha"]'));
    await click(() => byText(document.body, '[role="menuitemradio"]', 'Beta'));
    await expect.poll(() => app.splash(), WAIT).toBe(true);
    expect(app.container.textContent).toContain('Opening Beta…');
    // still named while the splash is held, after B is open
    await expect.poll(() => main.current, WAIT).toBe(B);
    expect(app.splash() && app.container.textContent!.includes('Opening Beta…')).toBe(true);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/notes');
    expect(app.container.querySelector('[aria-label="Workspace: Beta"]')).not.toBeNull();
    expect(main.workspaces.get(A)!.lastPage).toBe('/app/home');
  });

  it('creates a workspace from the menu’s dialog, and opens it', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    const app = await openOn(main, '/app/home');
    await click(() => app.container.querySelector('[aria-label="Workspace: Alpha"]'));
    await click(() => byText(document.body, '[role="menuitem"]', 'New workspace'));
    await expect.poll(() => document.querySelector('[role="dialog"] input'), WAIT).not.toBeNull();
    typeInto(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'Gamma');
    await click(() =>
      byText(document.querySelector('[role="dialog"]')!, 'button', 'Create Workspace'),
    );
    await expect
      .poll(() => app.container.querySelector('[aria-label="Workspace: Gamma"]'), WAIT)
      .not.toBeNull();
    const created = [...main.workspaces.values()].find((w) => w.name === 'Gamma')!;
    expect(created.color).toBe('#2b7fff');
    expect(main.current).toBe(created.id);
  });

  it('a switch to a workspace whose folder is gone stays in the open one and says so', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null), workspace(B, 'Beta', null)]);
    main.missing.add(B);
    const app = await openOn(main, '/app/notes');
    await click(() => app.container.querySelector('[aria-label="Workspace: Alpha"]'));
    await click(() => byText(document.body, '[role="menuitemradio"]', 'Beta'));
    await expect.poll(dialog, WAIT).not.toBeNull();
    expect(dialog()!.textContent).toContain('Can’t find Beta’s folder');
    expect(app.page()!.path).toBe('/app/notes');
    expect(main.current).toBe(A);
  });
});

describe('onboarding', () => {
  it('Welcome with no workspace: create one, which opens on its landing page', async () => {
    const main = new FakeMain([]);
    const app = mount(main);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
    expect(app.page()!.text).toContain('Tasks, notes and your calendar in one place');
    await click(() => byText(app.container, 'button', 'Create Workspace'));
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding/new_workspace');
    const create = byText(app.container, 'button', 'Create Workspace')!;
    expect(create.hasAttribute('disabled')).toBe(true);
    typeInto(app.container.querySelector('input')!, 'Personal');
    await click(() => byText(app.container, 'button', 'Create Workspace'));
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');
    expect(app.container.querySelector('[aria-label="Workspace: Personal"]')).not.toBeNull();
  });

  it('Welcome lists the recent workspaces, last opened first, and opens the one picked', async () => {
    const main = new FakeMain([
      { ...workspace(A, 'Alpha', null), lastOpenedAt: 1 },
      { ...workspace(B, 'Beta', '/app/tasks'), lastOpenedAt: 2 },
    ]);
    const app = mount(main);
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding');
    const names = [...app.container.querySelectorAll('[data-page] button')]
      .map((button) => button.textContent ?? '')
      .filter((text) => /Alpha|Beta/.test(text));
    expect(names.map((name) => (name.includes('Beta') ? 'Beta' : 'Alpha'))).toEqual([
      'Beta',
      'Alpha',
    ]);
    await click(() => byText(app.container, 'button', 'Alpha'));
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');
    expect(main.current).toBe(A);
  });

  it('shows every workspace on Choose workspace when there are more than Welcome lists', async () => {
    const ids = ['wsp_1', 'wsp_2', 'wsp_3', 'wsp_4'].map((id) => id.padEnd(26, 'x'));
    const main = new FakeMain(ids.map((id, n) => workspace(id as never, `W${n}`, null)));
    const app = mount(main);
    await click(() => byText(app.container, 'a', 'All workspaces (4)'));
    await expect.poll(() => app.page()?.path, WAIT).toBe('/onboarding/choose_workspace');
    expect(['W0', 'W1', 'W2', 'W3'].every((name) => app.page()!.text.includes(name))).toBe(true);
  });

  it('Open Existing Folder adds the folder and opens it', async () => {
    const main = new FakeMain([]);
    main.importResult = workspace(B, 'Beta', null);
    const app = mount(main);
    await click(() => byText(app.container, 'button', 'Open Existing Folder'));
    await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');
    expect(main.current).toBe(B);
  });

  it.each([
    [
      'a folder that isn’t a workspace',
      new CallError('workspace_import', 'Downloads is not…', { reason: 'not_a_workspace' }),
      'This folder isn’t a DevBrain workspace',
      'Choose Another Folder',
    ],
    [
      'a workspace already in the list',
      new CallError('workspace_import', 'already', { reason: 'already_added', workspaceId: A }),
      'Alpha is already in your list',
      'Open Alpha',
    ],
    [
      'a workspace from a newer DevBrain',
      new CallError('workspace_too_new', 'newer'),
      'This workspace needs a newer DevBrain',
      'Close',
    ],
  ])('says why on %s', async (_, error, title, action) => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    main.importResult = error;
    const app = mount(main);
    await click(() => byText(app.container, 'button', 'Open Existing Folder'));
    await expect.poll(dialog, WAIT).not.toBeNull();
    expect(dialog()!.textContent).toContain(title);
    expect(byText(dialog()!, 'button', action)).not.toBeNull();
    if (action === 'Open Alpha') {
      byText(dialog()!, 'button', action)!.click();
      await expect.poll(() => app.page()?.path, WAIT).toBe('/app/home');
      expect(main.current).toBe(A);
    }
  });
});

describe('DevBrain unavailable', () => {
  it('shows only the error, opens nothing, and shows the log file', async () => {
    const main = new FakeMain([workspace(A, 'Alpha', null)]);
    main.devBrainAvailable = false;
    main.lastWorkspaceId = A;
    const app = mount(main);
    const screen = () => app.container.querySelector('[data-devbrain-unavailable]');
    await expect.poll(screen, WAIT).not.toBeNull();
    expect(screen()!.textContent).toContain('DevBrain couldn’t open its data folder');
    expect(app.page()).toBeNull();
    expect(app.splash()).toBe(false);
    byText(app.container, 'button', 'Show Log File')!.click();
    await expect.poll(() => main.calls.includes('app.showLogFile'), WAIT).toBe(true);
    expect(main.calls.filter((path) => path.startsWith('workspaces.'))).toEqual([]);
  });
});

// sets an input's value as typing does, so React's onChange sees it
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
