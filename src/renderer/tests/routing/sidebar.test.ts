// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { FakeMain, workspace } from './fake-main';
import { eventually, startApp, stopApps } from './harness';

// The app's sidebar, in a workspace where nothing is favorited (the fake main's favorites.list).

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

async function onWorkHome() {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
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
    const help = [...sidebar().querySelectorAll('button')].find((b) => b.textContent === 'Help');
    expect(help?.disabled).toBe(false);
    help!.click();
    await eventually(() => expect(document.body.textContent).toContain('Keyboard shortcuts'));
    expect(document.body.textContent).toContain('Go to Tasks');
  });
});
