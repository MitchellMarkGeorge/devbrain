// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, splashOf, startApp, stopApps } from './harness';

// Onboarding, creating and adding workspaces, and opens that fail (docs/renderer/routing.md).

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;

afterEach(() => stopApps());

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('onboarding', () => {
  it('Welcome lists the workspaces most recently opened first; picking one opens it', async () => {
    const main = new FakeMain([
      workspace(WORK, 'Work', { lastOpenedAt: 1_000 }),
      workspace(HOME, 'Home', { lastOpenedAt: 2_000 }),
    ]);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Recent workspaces'));
    const names = [...app.container.querySelectorAll('[role="group"] button')].map(
      (button) => button.textContent,
    );
    expect(names[0]).toContain('Home');
    expect(names[1]).toContain('Work');

    click(byText(app.container, 'button', 'Work'));
    await eventually(() => expect(app.text()).toContain('Work recents.list'));
    expect(app.path()).toBe(`/app/${WORK}/home`);
    expect(main.open).toBe(WORK);
  });

  it('Choose workspace lists every workspace, a page at a time', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      workspace(`wsp_${String(i).padStart(2, '0')}`, `Space ${i}`),
    );
    const main = new FakeMain(many);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('All workspaces'));
    click(byText(app.container, 'a', 'All workspaces'));
    await eventually(() => expect(app.text()).toContain('Choose a workspace'));
    expect(app.text()).toContain('Space 19');
    expect(app.text()).not.toContain('Space 20');
    click(byText(app.container, 'button', 'Show More'));
    await eventually(() => expect(app.text()).toContain('Space 24'));

    click(byText(app.container, 'button', 'Space 24'));
    await eventually(() => expect(main.open).toBe('wsp_24'));
  });

  it('Create workspace creates it, then goes to it, which opens it', async () => {
    const main = new FakeMain([]);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Create Workspace'));
    click(byText(app.container, 'a, [role="button"]', 'Create Workspace'));
    await eventually(() => expect(app.container.querySelector('form')).not.toBeNull());
    expect(app.path()).toBe('/onboarding/new_workspace');

    // a name is needed
    click(byText(app.container, 'button[type="submit"]', 'Create Workspace'));
    await eventually(() => expect(app.text()).toContain('Enter a name for the workspace.'));
    expect(main.callsTo('workspaces.create')).toEqual([]);

    type(app.container.querySelector('input')!, 'Open source');
    click(byText(app.container, 'button[type="submit"]', 'Create Workspace'));
    await eventually(() => expect(app.text()).toContain('Open source recents.list'));
    expect(main.callsTo('workspaces.create')[0].input).toEqual({
      name: 'Open source',
      color: '#00bc7d',
    });
    expect(app.path()).toBe('/app/wsp_new1/home');
    expect(main.open).toBe('wsp_new1');
  });

  it('Create workspace’s Back returns to Welcome', async () => {
    const main = new FakeMain([]);
    const app = startApp(main, { url: '/onboarding/new_workspace' });
    await eventually(() => expect(app.text()).toContain('Create a workspace'));
    click(byText(app.container, 'button', 'Back'));
    await eventually(() => expect(app.path()).toBe('/onboarding'));
  });

  it('Open Existing Folder adds the folder, then goes to its workspace', async () => {
    const main = new FakeMain([]);
    main.importResult = workspace('wsp_carried', 'Carried');
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Open Existing Folder…'));
    click(byText(app.container, 'button', 'Open Existing Folder…'));
    await eventually(() => expect(app.text()).toContain('Carried recents.list'));
    expect(main.open).toBe('wsp_carried');
  });

  it('Open Existing Folder does nothing when the dialog is cancelled', async () => {
    const main = new FakeMain([]);
    const app = startApp(main, { url: '/onboarding' });
    await eventually(() => expect(app.text()).toContain('Open Existing Folder…'));
    click(byText(app.container, 'button', 'Open Existing Folder…'));
    await eventually(() => expect(main.callsTo('workspaces.importFolder')).toHaveLength(1));
    expect(app.path()).toBe('/onboarding');
    expect(main.callsTo('workspaces.open')).toEqual([]);
  });

  describe('a folder that can’t be added says why', () => {
    async function failingImport(error: ReturnType<typeof FakeMain.error>) {
      const main = new FakeMain([workspace(WORK, 'Work')]);
      main.importResult = error;
      const app = startApp(main, { url: '/onboarding' });
      await eventually(() => expect(app.text()).toContain('Open Existing Folder…'));
      click(byText(app.container, 'button', 'Open Existing Folder…'));
      await eventually(() =>
        expect(document.querySelector('[data-testid="import-error"]')).not.toBeNull(),
      );
      return { main, app, dialog: document.querySelector('[data-testid="import-error"]')! };
    }

    it('not a workspace: offers another folder', async () => {
      const { main, dialog } = await failingImport(
        FakeMain.error(
          'workspace_import',
          'Downloads is not a DevBrain workspace folder: it has no workspace database',
          { reason: 'not_a_workspace' },
        ),
      );
      expect(dialog.textContent).toContain('This folder isn’t a DevBrain workspace');
      click(byText(dialog, 'button', 'Choose Another Folder'));
      await eventually(() => expect(main.callsTo('workspaces.importFolder')).toHaveLength(2));
    });

    it('already in the list: offers to open it', async () => {
      const { main, app, dialog } = await failingImport(
        FakeMain.error('workspace_import', 'This folder is already in your list as "Work"', {
          reason: 'already_added',
          workspaceId: WORK,
        }),
      );
      expect(dialog.textContent).toContain('already in your list as "Work"');
      click(byText(dialog, 'button', 'Open It'));
      await eventually(() => expect(app.text()).toContain('Work recents.list'));
      expect(main.open).toBe(WORK);
    });

    it('needs a newer DevBrain', async () => {
      const { dialog } = await failingImport(
        FakeMain.error('workspace_too_new', 'This workspace was last used by a newer version'),
      );
      expect(dialog.textContent).toContain('This workspace needs a newer DevBrain');
    });

    it('unreadable', async () => {
      const { dialog } = await failingImport(
        FakeMain.error('workspace_import', 'DevBrain doesn’t have permission to read Private', {
          reason: 'unreadable',
        }),
      );
      expect(dialog.textContent).toContain('DevBrain can’t read this folder');
    });
  });
});

describe('in the app', () => {
  async function onWork(main: FakeMain) {
    const app = startApp(main, { url: `/app/${WORK}/tasks` });
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    return app;
  }

  async function openMenuItem(app: { container: HTMLElement }, label: string) {
    click(app.container.querySelector('[aria-label="Workspace: Work"]'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', label)).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', label));
  }

  it('New workspace… creates it in a dialog over the page, then switches to it', async () => {
    const main = new FakeMain([workspace(WORK, 'Work')], WORK);
    const app = await onWork(main);
    await openMenuItem(app, 'New workspace…');
    await eventually(() =>
      expect(document.body.textContent).toContain('It opens once it’s created.'),
    );
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    type(dialog.querySelector('input')!, 'Side');
    click(byText(dialog, 'button[type="submit"]', 'Create Workspace'));
    await eventually(() => expect(app.text()).toContain('Side recents.list'));
    expect(main.open).toBe('wsp_new1');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Open folder… adds a folder and switches to it', async () => {
    const main = new FakeMain([workspace(WORK, 'Work')], WORK);
    main.importResult = workspace('wsp_carried', 'Carried');
    const app = await onWork(main);
    await openMenuItem(app, 'Open folder…');
    await eventually(() => expect(app.text()).toContain('Carried recents.list'));
    expect(main.open).toBe('wsp_carried');
  });
});

describe('an open that fails', () => {
  it('before anything closed (a missing folder): says why, and goes back to the workspace still open', async () => {
    const main = new FakeMain(
      [workspace(WORK, 'Work'), workspace(HOME, 'Home', { missing: true })],
      WORK,
    );
    const app = startApp(main, { url: `/app/${WORK}/tasks` });
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    await app.router.navigate({ to: '/app/$workspaceId/notes', params: { workspaceId: HOME } });
    await eventually(() => expect(app.text()).toContain('Can’t find Home’s folder'));
    expect(splashOf(app.container)).toBeNull();
    expect(main.open).toBe(WORK);

    click(byText(app.container, 'button', 'Back to Work'));
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    expect(app.path()).toBe(`/app/${WORK}/tasks`);
    // Work stayed open throughout
    expect(main.callsTo('workspaces.open').map((call) => call.input)).toEqual([{ id: HOME }]);
  });

  it('after the open one closed (a failed migration): says why, and offers onboarding', async () => {
    const main = new FakeMain(
      [
        workspace(WORK, 'Work'),
        workspace(HOME, 'Home', { failsAfterClose: 'workspace_migration' }),
      ],
      WORK,
    );
    const app = startApp(main, { url: `/app/${WORK}/tasks` });
    await eventually(() => expect(app.text()).toContain('Work tasks.list'));
    await app.router.navigate({ to: '/app/$workspaceId', params: { workspaceId: HOME } });
    await eventually(() => expect(app.text()).toContain('Home couldn’t be updated'));
    expect(main.open).toBeNull();
    expect(app.text()).toContain('Show Log File');

    click(byText(app.container, 'button', 'Choose a Workspace'));
    await eventually(() => expect(app.text()).toContain('Welcome to DevBrain'));
  });

  it('at startup: says why, with the way to another workspace', async () => {
    const main = new FakeMain([
      workspace(WORK, 'Work', { missing: true }),
      workspace(HOME, 'Home'),
    ]);
    const app = startApp(main, { url: `/app/${WORK}` });
    await eventually(() => expect(app.text()).toContain('Can’t find Work’s folder'));
    click(byText(app.container, 'button', 'Choose a Workspace'));
    await eventually(() => expect(app.text()).toContain('Recent workspaces'));
  });

  it('for a workspace no longer in the list', async () => {
    const main = new FakeMain([workspace(HOME, 'Home')]);
    const app = startApp(main, { url: '/app/wsp_gone/home' });
    await eventually(() => expect(app.text()).toContain('This workspace isn’t in your list'));
  });
});
