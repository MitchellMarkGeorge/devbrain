// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { IntegrationStatus, Provider, SourceType } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The app's sidebar, in a workspace where nothing is favorited (the fake main's favorites.list).

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

async function onWorkHome(setup: (main: FakeMain) => void = () => {}) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  setup(main);
  const app = startApp(main, { url: `/app/${WORK}/home` });
  await eventually(() => expect(app.text()).toContain('Work recents.list'));
  return app;
}

const sidebar = () => document.querySelector('[aria-label="Sidebar"]')!;

describe('the sidebar', () => {
  it('keeps Favorites with a hint while nothing is starred', async () => {
    await onWorkHome();
    await eventually(() =>
      expect(sidebar().textContent).toContain('Star a task, note or project to keep it here.'),
    );
    expect(sidebar().textContent).toContain('Favorites');
  });

  it('opens the keyboard shortcuts from Help', async () => {
    await onWorkHome();
    const help = sidebar().querySelector<HTMLButtonElement>('button[aria-label="Help"]');
    expect(help?.disabled).toBe(false);
    help!.click();
    await eventually(() => expect(document.body.textContent).toContain('Keyboard shortcuts'));
    expect(document.body.textContent).toContain('Go to Tasks');
  });

  it('links Trash from its footer icon, which then shows as the current page', async () => {
    const app = await onWorkHome();
    const trash = () => sidebar().querySelector<HTMLAnchorElement>('a[aria-label="Trash"]');
    expect(trash()?.getAttribute('aria-current')).toBeNull();
    trash()!.click();
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/trash`));
    await eventually(() => expect(trash()?.getAttribute('aria-current')).toBe('page'));
  });

  it('invites to "Set up sync" while nothing is connected, opening Integrations', async () => {
    const app = await onWorkHome();
    const line = () => byText(sidebar(), 'button', 'Set up sync');
    await eventually(() => expect(line()).toBeTruthy());
    click(line()!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/integrations`));
  });

  it('says "Sync off" while an integration is connected with every source turned off', async () => {
    await onWorkHome((main) =>
      main.routes.set('sync.status', () => [
        [
          {
            sourceId: 'src_tasks',
            integrationId: 'int_linear',
            provider: Provider.LINEAR,
            sourceType: SourceType.TASKS,
            status: IntegrationStatus.CONNECTED,
            enabled: false,
            running: false,
            lastSyncedAt: null,
            lastError: null,
            retryAt: null,
          },
        ],
        [],
      ]),
    );
    await eventually(() => expect(byText(sidebar(), 'button', 'Sync off')).toBeTruthy());
    expect(sidebar().textContent).not.toContain('Set up sync');
  });
});
