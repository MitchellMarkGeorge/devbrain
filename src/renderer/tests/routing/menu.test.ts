import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { MenuCommandId, MenuPage } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { GoToPage } from '@renderer/keyboard';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The app menu's `app.command` in a workspace: it runs a command from the window's registry, as its
// keys would, and File › Import and Export run the Settings page's own flow.

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
      // Settings opens on its first section
      const path = page === 'settings' ? 'settings/general' : page;
      await eventually(() => expect(app.path()).toBe(`/app/${WORK}/${path}`));
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

describe("the menu's Import and Export", () => {
  it("imports through the Settings page's route, and shows its summary dialog", async () => {
    const { main, app } = await onWorkHome();
    main.routes.set('transfer.importTasks', () => [
      {
        created: 3,
        skipped: [],
        errors: [{ row: 4, title: null, message: 'No title' }],
        warnings: [],
      },
      ['task'],
    ]);
    main.push('app.command', { command: 'transfer.importTasks', workspaceId: WORK });
    await eventually(() => expect(document.body.textContent).toContain('Imported 3 tasks'));
    expect(main.callsTo('transfer.importTasks')).toHaveLength(1);
    expect(document.body.textContent).toContain('Into Work. 1 row was skipped.');
    expect(document.body.textContent).toContain('Row 4');
    click(byText(document.body, 'button', 'View Tasks'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
  });

  it("exports, and its toast's Show in Finder shows the exported folder", async () => {
    const { main } = await onWorkHome();
    main.routes.set('transfer.exportNotes', () => [
      {
        path: '/Users/me/DevBrain notes',
        count: 5,
        errors: [{ noteId: 'nte_1', title: 'Gone', message: 'unreadable' }],
      },
      [],
    ]);
    main.routes.set('app.showFile', () => [undefined, []]);
    main.push('app.command', { command: 'transfer.exportNotes', workspaceId: WORK });
    await eventually(() => expect(document.body.textContent).toContain('Exported 5 notes'));
    expect(document.body.textContent).toContain(
      'Saved to DevBrain notes. 1 note couldn’t be read and was left out.',
    );
    click(byText(document.body, 'button', 'Show in Finder'));
    await eventually(() => expect(main.callsTo('app.showFile')).toHaveLength(1));
    expect(main.callsTo('app.showFile')[0].input).toEqual({
      path: '/Users/me/DevBrain notes',
    });
  });

  it('exports tasks in the format the item names', async () => {
    const { main } = await onWorkHome();
    main.routes.set('transfer.exportTasks', (args) => [
      { path: `/out/tasks.${args.format as string}`, format: args.format, count: 2 },
      [],
    ]);
    main.push('app.command', { command: 'transfer.exportTasksJson', workspaceId: WORK });
    await eventually(() => expect(document.body.textContent).toContain('Saved tasks.json.'));
    expect(main.callsTo('transfer.exportTasks')[0].input).toEqual({ format: 'json' });
  });

  it('shows a failure as the Settings buttons do', async () => {
    const { main } = await onWorkHome();
    main.routes.set('transfer.importNotes', () => {
      throw FakeMain.error('import_file', 'That file is too large to import');
    });
    main.push('app.command', { command: 'transfer.importNotes', workspaceId: WORK });
    await eventually(() => expect(document.body.textContent).toContain('Couldn’t import notes'));
  });

  it('runs one transfer at a time, whichever entry point started it', async () => {
    const { main } = await onWorkHome();
    main.routes.set('transfer.importTasks', () => [null, []]);
    const release = main.hold('transfer.importTasks');
    main.push('app.command', { command: 'transfer.importTasks', workspaceId: WORK });
    await eventually(() => expect(main.callsTo('transfer.importTasks')).toHaveLength(1));
    main.push('app.command', { command: 'transfer.exportNotes', workspaceId: WORK });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.callsTo('transfer.exportNotes')).toHaveLength(0);
    release();
  });

  it('drops a command sent for another workspace', async () => {
    const { main } = await onWorkHome();
    main.push('app.command', { command: 'transfer.exportTasksCsv', workspaceId: HOME });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.callsTo('transfer.exportTasks')).toHaveLength(0);
  });
});
