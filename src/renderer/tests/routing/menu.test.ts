// @vitest-environment happy-dom
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { MenuCommandId, MenuPage } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { GoToPage } from '../../keyboard';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The app menu's events in a workspace: `app.command` runs the keyboard layer's command, as its
// keys would, and `transfer.completed` shows an import's summary or an export's toast, as the
// Settings buttons do.

const WORK = 'wsp_work' as WorkspaceId;
const HOME = 'wsp_home' as WorkspaceId;

afterEach(() => stopApps());

async function onWorkHome() {
  const main = new FakeMain([workspace(WORK, 'Work'), workspace(HOME, 'Home')], WORK);
  const app = startApp(main, { url: `/app/${WORK}/home` });
  await eventually(() => expect(app.text()).toContain('Work recents.list'));
  return { main, app };
}

const dialogLabelled = (label: string) =>
  document.querySelector(`[role="dialog"][aria-label="${label}"]`);

describe('app.command', () => {
  it("names a registered command for each page Go to lists (the keyboard layer's pages)", () => {
    // every page but Settings, which has its own item, is a GoToPage, and the other way round
    expectTypeOf<MenuPage>().toEqualTypeOf<GoToPage>();
  });

  it('runs New Task, New Note and Find… as C, N and ⌘K do', async () => {
    const { main } = await onWorkHome();
    main.push('app.command', { command: 'task.new', workspaceId: WORK });
    await eventually(() => expect(dialogLabelled('New task')).not.toBeNull());
    main.push('app.command', { command: 'search.open', workspaceId: WORK });
    await eventually(() => expect(dialogLabelled('Search')).not.toBeNull());
    main.push('app.command', { command: 'note.new', workspaceId: WORK });
    await eventually(() => expect(main.callsTo('notes.create')).toHaveLength(1));
  });

  it('goes to Settings and to each page', async () => {
    const { main, app } = await onWorkHome();
    const pages: MenuPage[] = ['settings', 'tasks', 'calendar', 'trash', 'home'];
    for (const page of pages) {
      main.push('app.command', { command: `nav.${page}` as MenuCommandId, workspaceId: WORK });
      await eventually(() => expect(app.path()).toBe(`/app/${WORK}/${page}`));
    }
  });

  it('drops a command sent for another workspace', async () => {
    const { main, app } = await onWorkHome();
    main.push('app.command', { command: 'nav.tasks', workspaceId: HOME });
    main.push('app.command', { command: 'task.new', workspaceId: HOME });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.path()).toBe(`/app/${WORK}/home`);
    expect(dialogLabelled('New task')).toBeNull();
  });
});

describe('transfer.completed', () => {
  it("shows an import's summary dialog, with View Tasks", async () => {
    const { main, app } = await onWorkHome();
    main.push('transfer.completed', {
      workspaceId: WORK,
      report: {
        type: 'tasksImported',
        summary: {
          created: 3,
          skipped: [],
          errors: [{ row: 4, title: null, message: 'No title' }],
          warnings: [],
        },
      },
    });
    await eventually(() => expect(document.body.textContent).toContain('Imported 3 tasks'));
    expect(document.body.textContent).toContain('Into Work. 1 row was skipped.');
    expect(document.body.textContent).toContain('Row 4');
    click(byText(document.body, 'button', 'View Tasks'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
  });

  it("shows an export's toast, whose Show in Finder asks main for the last export", async () => {
    const { main } = await onWorkHome();
    main.routes.set('transfer.showExport', () => [undefined, []]);
    main.push('transfer.completed', {
      workspaceId: WORK,
      report: { type: 'notesExported', name: 'DevBrain notes', count: 5, errors: 1 },
    });
    await eventually(() => expect(document.body.textContent).toContain('Exported 5 notes'));
    expect(document.body.textContent).toContain(
      'Saved to DevBrain notes. 1 note couldn’t be read and was left out.',
    );
    click(byText(document.body, 'button', 'Show in Finder'));
    await eventually(() => expect(main.callsTo('transfer.showExport')).toHaveLength(1));
    expect(main.callsTo('transfer.showExport')[0].input).toBeUndefined();
  });

  it('drops a report from another workspace', async () => {
    const { main } = await onWorkHome();
    main.push('transfer.completed', {
      workspaceId: HOME,
      report: { type: 'tasksExported', name: 'tasks.csv', format: 'csv', count: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.body.textContent).not.toContain('Exported');
  });
});
