// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The window's title bar in a workspace: the workspace menu at its start, the search field showing
// the page's title (and opening search), and New's menu. The sidebar keeps none of them.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

async function onWorkHome() {
  const main = new FakeMain([workspace(WORK, 'Work'), workspace('wsp_home', 'Home')], WORK);
  const app = startApp(main, { url: `/app/${WORK}/home` });
  await eventually(() => expect(app.text()).toContain('Work recents.list'));
  return { main, app };
}

const field = () => document.querySelector<HTMLElement>('button[aria-label="Search"]');
const dialogLabelled = (label: string) =>
  document.querySelector(`[role="dialog"][aria-label="${label}"]`);
const menuItem = (text: string) => byText(document.body, '[role="menuitem"]', text);

describe('the title bar', () => {
  it('shows the page’s title in the search field, following the page', async () => {
    const { app } = await onWorkHome();
    await eventually(() => expect(field()?.textContent).toContain('Home'));
    click(byText(app.container, 'nav[aria-label="Main"] a', 'Tasks'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
    await eventually(() => expect(field()?.textContent).toContain('Tasks'));
    expect(field()?.textContent).not.toContain('Home');
  });

  it('names the window after the page, following it', async () => {
    const { app } = await onWorkHome();
    await eventually(() => expect(document.title).toBe('Home'));
    click(byText(app.container, 'nav[aria-label="Main"] a', 'Tasks'));
    await eventually(() => expect(document.title).toBe('Tasks'));
  });

  it('opens search from the field', async () => {
    await onWorkHome();
    click(field());
    await eventually(() => expect(dialogLabelled('Search')).not.toBeNull());
  });

  it('opens New task, New note, New project and New event from New, in that order', async () => {
    const { main } = await onWorkHome();
    click(document.querySelector('[aria-label="New"]'));
    await eventually(() => expect(menuItem('New task')).not.toBeNull());
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
      item.textContent?.replace(/[CN]$/, ''),
    );
    expect(items).toEqual(['New task', 'New note', 'New project', 'New event']);
    click(menuItem('New task'));
    await eventually(() => expect(dialogLabelled('New task')).not.toBeNull());
    expect(main.callsTo('notes.create')).toHaveLength(0);
  });

  it('opens the workspace menu from the workspace at its start', async () => {
    await onWorkHome();
    click(document.querySelector('[aria-label="Workspace: Work"]'));
    await eventually(() => expect(menuItem('New workspace…')).not.toBeNull());
    expect(document.body.textContent).toContain('Home');
  });

  it('leaves the sidebar without the workspace menu, search or New', async () => {
    await onWorkHome();
    const sidebar = document.querySelector('nav[aria-label="Main"]')!;
    expect(sidebar.querySelector('[aria-label^="Workspace:"]')).toBeNull();
    expect(sidebar.querySelector('[aria-label="Search"]')).toBeNull();
    expect(sidebar.querySelector('[aria-label="New note"]')).toBeNull();
  });
});
