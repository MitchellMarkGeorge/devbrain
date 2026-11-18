// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import type { TaskImportSummary } from '@common/types';
import { trpc, queryClient } from '@renderer/ipc';
import { FakeMain, workspace } from './fake-main';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The settings: a page per section, listed in the settings' own sidebar (the open workspace's
// sections apart from every workspace's) with Back to app; older ?tab links; each control writing
// its one setting through settings.set at once; the workspace's name and colour, Delete workspace
// (typed, then onboarding), Reset settings, and Import with its summary.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function settingsPage(path = '/settings/general') {
  const main = new FakeMain([workspace(WORK, 'Work'), workspace('wsp_home', 'Home')], WORK);
  main.routes.set('settings.set', (args) => {
    const keys = (args.path as string).split('.').slice(1);
    const settings = {
      theme: 'system',
      general: main.settings,
      tasks: main.taskSettings,
      calendar: main.calendarSettings,
    } as Record<string, unknown>;
    let node = settings;
    for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
    node[keys[keys.length - 1]] = args.value;
    return [{ ...settings, devBrainPath: '/brain' }, ['settings']];
  });
  const app = startApp(main, { url: `/app/${WORK}${path}` });
  return { main, app };
}

const setCalls = (main: FakeMain) => main.callsTo('settings.set').map((call) => call.input);
const control = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;

const settingsNav = () => document.querySelector<HTMLElement>('nav[aria-label="Settings"]')!;

describe('the settings', () => {
  it('show a section a page, and another from their sidebar', async () => {
    const { app } = settingsPage();
    await eventually(() => expect(app.text()).toContain('Workspace name'));
    expect(app.text()).toContain('Danger zone');
    // the preferences are every workspace's, on a page of their own
    expect(app.text()).not.toContain('Appearance');
    click(byText(settingsNav(), 'a', 'Calendar'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/calendar`));
    await eventually(() => expect(app.text()).toContain('Hide weekends'));
  });

  it('list the open workspace’s sections apart from every workspace’s, in place of the app’s sidebar', async () => {
    settingsPage();
    await eventually(() => expect(settingsNav()).not.toBeNull());
    const groups = [...settingsNav().querySelectorAll('[role="group"]')]
      .map((group) => group.getAttribute('aria-label'))
      .filter((label) => label === 'Current workspace' || label === 'All workspaces');
    expect(groups).toEqual(['Current workspace', 'All workspaces']);
    const links = [...settingsNav().querySelectorAll('a')].map((a) => a.textContent);
    expect(links).toEqual([
      'General',
      'Integrations',
      'Import & export',
      'Preferences',
      'Tasks',
      'Calendar',
      'Data & storage',
    ]);
    expect(document.querySelector('nav[aria-label="Main"]')).toBeNull();
  });

  it('open General at /settings, and an older link’s ?tab at its section', async () => {
    const { app } = settingsPage('/settings');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/general`));
    stopApps();
    const older = settingsPage('/settings?tab=data_storage');
    await eventually(() => expect(older.app.path()).toBe(`/app/${WORK}/settings/data-storage`));
    stopApps();
    const bad = settingsPage('/settings?tab=everything');
    await eventually(() => expect(bad.app.path()).toBe(`/app/${WORK}/settings/general`));
  });

  it('send an older Integrations link to its section', async () => {
    const { app } = settingsPage('/integrations');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/integrations`));
  });

  it('go Back to app, to the page they were opened from', async () => {
    const { app } = settingsPage('/tasks');
    // the sidebar footer's Settings icon, named by its label
    const settingsLink = () => app.container.querySelector<HTMLElement>('a[aria-label="Settings"]');
    await eventually(() => expect(settingsLink()).toBeTruthy());
    click(settingsLink()!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/general`));
    await eventually(() => expect(settingsNav()).not.toBeNull());
    click(byText(settingsNav(), 'a', 'Tasks')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/settings/tasks`));
    click(byText(settingsNav(), 'button', 'Back to app')!);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
    await eventually(() => expect(document.querySelector('nav[aria-label="Main"]')).not.toBeNull());
  });

  it('writes one setting at a time, showing it at once', async () => {
    const { main } = settingsPage('/settings/calendar');
    await eventually(() => expect(control('Hide weekends')).toBeDefined());
    const hold = main.hold('settings.set');
    click(control('Hide weekends')!);
    // optimistic: the switch shows the new value before main has answered
    await eventually(() =>
      expect(queryClient.getQueryData(trpc.settings.get.queryKey())?.calendar.hideWeekends).toBe(
        true,
      ),
    );
    await eventually(() =>
      expect(control('Hide weekends')!.hasAttribute('data-checked')).toBe(true),
    );
    hold();
    await eventually(() =>
      expect(setCalls(main)).toEqual([{ path: 'settings.calendar.hideWeekends', value: true }]),
    );
    expect(main.calendarSettings.hideWeekends).toBe(true);
  });

  it('sets the confirmations and the time format in Preferences', async () => {
    const { main } = settingsPage('/settings/preferences');
    await eventually(() => expect(control('Ask before deleting permanently')).toBeDefined());
    click(control('Ask before deleting permanently')!);
    click(byText(control('Time format')!, 'button', '24-hour'));
    await eventually(() =>
      expect(setCalls(main)).toEqual([
        { path: 'settings.general.confirmBeforeDeleting', value: false },
        { path: 'settings.general.timeFormat', value: '24' },
      ]),
    );
  });

  it('renames the workspace when the name field is left', async () => {
    const { main } = settingsPage();
    main.routes.set('workspaces.update', (args) => {
      const found = main.workspaces.find((w) => w.id === args.id)!;
      Object.assign(found, args);
      return [found, ['workspace']];
    });
    await eventually(() => expect(control('Workspace name')).toBeDefined());
    const input = control('Workspace name') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    input.focus();
    setValue.call(input, 'Day job');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    await eventually(() => expect(main.callsTo('workspaces.update')).toHaveLength(1));
    expect(main.callsTo('workspaces.update')[0].input).toEqual({ id: WORK, name: 'Day job' });
  });

  it('deletes the workspace once its name is typed, then goes to onboarding', async () => {
    const { main, app } = settingsPage();
    await eventually(() => expect(app.text()).toContain('Delete Workspace'));
    click(byText(app.container, 'button', 'Delete Workspace'));
    const dialog = () => document.querySelector('[role="alertdialog"]')!;
    await eventually(() => expect(dialog().textContent).toContain('Type “Work” to confirm'));
    const action = byText(dialog(), 'button', 'Delete Workspace')!;
    expect(action.hasAttribute('disabled') || action.hasAttribute('data-disabled')).toBe(true);
    const input = dialog().querySelector('input')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input, 'Work');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await eventually(() => expect(action.hasAttribute('data-disabled')).toBe(false));
    click(action);
    await eventually(() => expect(main.callsTo('workspaces.delete')).toHaveLength(1));
    await eventually(() => expect(app.path()).toMatch(/^\/onboarding/));
    expect(main.workspaces.map((w) => w.id)).toEqual(['wsp_home']);
  });

  it('resets the settings after asking, from Data & storage', async () => {
    const { main, app } = settingsPage('/settings/data-storage');
    main.routes.set('settings.reset', () => [
      {
        theme: 'system',
        devBrainPath: '/brain',
        general: main.settings,
        tasks: main.taskSettings,
        calendar: main.calendarSettings,
      },
      ['settings'],
    ]);
    await eventually(() => expect(app.text()).toContain('Reset Settings'));
    click(byText(app.container, 'button', 'Reset Settings'));
    await eventually(() => expect(document.body.textContent).toContain('Reset settings?'));
    click(byText(document.querySelector('[role="alertdialog"]')!, 'button', 'Reset Settings'));
    await eventually(() => expect(main.callsTo('settings.reset')).toHaveLength(1));
    await eventually(() => expect(document.body.textContent).toContain('Settings reset'));
  });

  it('shows the data folder in Data & storage', async () => {
    const { app } = settingsPage('/settings/data-storage');
    await eventually(() => expect(app.text()).toContain('Data folder'));
    expect(app.text()).toContain('/brain');
  });

  it('imports tasks and shows what was left out, with View Tasks', async () => {
    const { main, app } = settingsPage('/settings/import-export');
    const summary: TaskImportSummary = {
      created: 42,
      skipped: [],
      errors: [
        { row: 12, title: null, message: 'No title' },
        { row: 30, title: 'Ship', message: 'Unknown status "Blocked"' },
      ],
      warnings: [],
    };
    main.routes.set('transfer.importTasks', () => [summary, ['task']]);
    await eventually(() => expect(app.text()).toContain('Import tasks'));
    click(byText(app.container, 'button', 'Choose File'));
    await eventually(() => expect(document.body.textContent).toContain('Imported 42 tasks'));
    expect(document.body.textContent).toContain('2 rows were skipped.');
    expect(document.body.textContent).toContain('Row 30');
    click(byText(document.body, 'button', 'View Tasks'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
  });

  it('says nothing when an import’s file dialog is cancelled', async () => {
    const { main, app } = settingsPage('/settings/import-export');
    main.routes.set('transfer.importNotes', () => [null, []]);
    await eventually(() => expect(app.text()).toContain('Import notes'));
    click(byText(app.container, 'button', 'Choose Files'));
    await eventually(() => expect(main.callsTo('transfer.importNotes')).toHaveLength(1));
    expect(document.body.textContent).not.toContain('Imported');
  });

  it('exports notes and says where', async () => {
    const { main, app } = settingsPage('/settings/import-export');
    main.routes.set('transfer.exportNotes', () => [
      { path: '/Users/me/Downloads/DevBrain notes', count: 12, errors: [] },
      [],
    ]);
    await eventually(() => expect(app.text()).toContain('Export notes'));
    const buttons = [...app.container.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Export',
    );
    click(buttons[buttons.length - 1]);
    await eventually(() => expect(document.body.textContent).toContain('Exported 12 notes'));
    expect(document.body.textContent).toContain('Saved to DevBrain notes.');
    // Show in Finder sends the path the export returned
    main.routes.set('app.showFile', () => [undefined, []]);
    // the toast's, not the data folder's above it
    const shows = [...document.querySelectorAll('button')].filter(
      (button) => button.textContent === 'Show in Finder',
    );
    click(shows[shows.length - 1]);
    await eventually(() => expect(main.callsTo('app.showFile')).toHaveLength(1));
    expect(main.callsTo('app.showFile')[0].input).toEqual({
      path: '/Users/me/Downloads/DevBrain notes',
    });
  });
});
