import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { journalEntries, migrationsWithExtra } from '../support/migrations';
import { goTo, switchWorkspace, taskRow, workspaceButton } from '../support/ui';

// Each test opens a DevBrain folder an earlier version of the app left (e2e/upgrade/fixtures,
// built by scripts/build_upgrade_fixtures.mts) with today's app: its migrations run, its rows
// survive, and its pages show them. docs/testing.md says how to add a fixture when a migration
// lands.

const TABLES = [
  'projects',
  'tasks',
  'notes',
  'events',
  'integrations',
  'external_sources',
  'external_links',
] as const;

// what every database holds once today's app has opened it: each migration, at its journal time
const ALL_MIGRATIONS = journalEntries().map((entry) => entry.when);

// A row in the Trash. A task's row is named by its status first, and may also name its project,
// so it is found by its title's own text
function trashRow(trash: Locator, title: string) {
  return trash.getByRole('row').filter({ has: trash.page().getByText(title, { exact: true }) });
}

// the week grid's day headers, Monday (or Sunday) first
function weekDays(window: Page) {
  return window.getByRole('main').getByRole('columnheader');
}

test.describe('0018: before calendars and the event model', () => {
  const FIXTURE = '0018-before-calendars';
  const ID = 'wsp_0199a3c2-5e10-7d41-9a2b-3c4d5e6f7a18';

  test('opens: migrations run, rows survive, the pages show them', async ({ devbrain }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const before = devbrain.state.rowCounts(ID, TABLES);
    expect(devbrain.state.appliedMigrations(ID)).toEqual(ALL_MIGRATIONS.slice(0, 19));

    // the workspace open last time; its name and colour come from the old workspaces.json
    const { window } = await devbrain.launch();
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Old Personal');
    await expect(window).toHaveURL(new RegExp(`#/app/${ID}/home$`));
    const main = window.getByRole('main');

    // tasks: a subtask, a project, a Linear issue with its key
    await goTo(window, 'Tasks');
    await expect(taskRow(main, 'Plan the launch')).toContainText('Website relaunch');
    await expect(taskRow(main, 'Plan the launch')).toContainText('0/1');
    await expect(taskRow(main, 'Write the homepage copy')).toBeVisible();
    const synced = taskRow(main, 'Fix the login redirect');
    await expect(synced.getByRole('button', { name: 'Linear ENG-42' })).toBeVisible();
    await expect(synced.getByRole('img', { name: 'High priority' })).toBeVisible();

    // notes, read from their files
    await goTo(window, 'Notes');
    const notes = main.getByRole('grid', { name: 'Notes' });
    await notes.getByRole('row', { name: /Launch checklist/ }).click();
    await expect(main.getByRole('textbox', { name: 'Note' })).toContainText(
      'Update the pricing page',
    );

    // the trash: a project with its task, and a note
    await goTo(window, 'Trash');
    const trash = main.getByRole('grid', { name: 'Trash' });
    // a project's row is named by its title first
    await expect(trash.getByRole('row', { name: /^Old experiments/ })).toBeVisible();
    await expect(trashRow(trash, 'Try a dark logo')).toBeVisible();
    await expect(trashRow(trash, 'Scratch')).toBeVisible();

    // settings from the old file: 24-hour kept, a setting it lacked at its default
    await goTo(window, 'Settings');
    const settingsNav = window.getByRole('navigation', { name: 'Settings' });
    await settingsNav.getByRole('link', { name: 'Preferences' }).click();
    await expect(
      main.getByRole('group', { name: 'Time format' }).getByRole('button', { name: '24-hour' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await settingsNav.getByRole('link', { name: 'Calendar' }).click();
    await expect(main.getByRole('switch', { name: 'Hide weekends' })).not.toBeChecked();

    await devbrain.quit();
    const { state } = devbrain;
    expect(state.appliedMigrations(ID)).toEqual(ALL_MIGRATIONS);
    expect(state.rowCounts(ID, TABLES)).toEqual(before);
    // the name moved into the workspace's own manifest (moveDetailsToManifests)
    expect(state.manifest(ID)).toMatchObject({ name: 'Old Personal', color: '#f59e0b' });
    // 0019-0021: every event in the default calendar; an all-day event got its dates
    expect(state.query(ID, 'SELECT DISTINCT calendar_id FROM events')).toEqual([
      { calendar_id: 'cal_default' },
    ]);
    expect(
      state.query(ID, "SELECT start_date, end_date FROM events WHERE title = 'Company offsite'"),
    ).toEqual([{ start_date: '2026-10-15', end_date: '2026-10-16' }]);
    // links and the trash as they were
    expect(
      state.query(ID, 'SELECT count(*) AS n FROM tasks WHERE archived_at IS NOT NULL')[0],
    ).toEqual({ n: 1 });
    expect(
      state.query(ID, "SELECT parent_task_id FROM tasks WHERE title = 'Write the homepage copy'"),
    ).toEqual([{ parent_task_id: 'tsk_0199a3c2-6000-7a01-8c01-000000000001' }]);
    expect(state.query(ID, 'PRAGMA foreign_key_check')).toEqual([]);
  });

  // Known bug: before 2026-11-06 DevBrain stored a recurrence rule as a bare value
  // (FREQ=WEEKLY;BYDAY=MO); core now reads RFC 5545 lines (RRULE:FREQ=…) and no migration adds
  // the prefix, so the series never shows. Remove test.fail once a data migration fixes the rows.
  test('a weekly series from then still repeats on the calendar', async ({ devbrain }) => {
    test.fail(true, 'recurrence rules stored without RRULE: are not migrated');
    await devbrain.useUpgradeFixture(FIXTURE);
    const { window } = await devbrain.launch();
    await goTo(window, 'Calendar');
    await expect(weekDays(window).first()).toHaveText(/^Mon/);
    await expect(window.getByRole('main').getByText('Weekly sync')).toBeVisible();
  });
});

test.describe('0026: before the manifest kept the last page', () => {
  const FIXTURE = '0026-before-manifest-last-page';
  const WORK = 'wsp_019a4a10-2b00-7c26-9a26-00000000000a';
  const SIDE = 'wsp_019a4a10-2b00-7c26-9a26-00000000000b';

  test('opens: migrations run, Linear priorities move, both workspaces open', async ({
    devbrain,
  }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const before = devbrain.state.rowCounts(WORK, TABLES);
    const priority = (title: string) =>
      devbrain.state.query<{ priority: number }>(
        WORK,
        'SELECT priority FROM tasks WHERE title = ?',
        title,
      )[0].priority;
    expect(priority('Triage the support inbox')).toBe(1);

    // the old state.lastPage is no longer read, and the manifest has none: the start page
    const { window } = await devbrain.launch();
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Work');
    await expect(window).toHaveURL(new RegExp(`#/app/${WORK}/home$`));
    const main = window.getByRole('main');

    // 0027: Linear's "No priority" is no longer shown as Low
    await goTo(window, 'Tasks');
    const triage = taskRow(main, 'Triage the support inbox');
    await expect(triage.getByRole('button', { name: 'Linear BIL-101' })).toBeVisible();
    await expect(triage.getByRole('img', { name: 'No priority' })).toBeVisible();
    await expect(
      taskRow(main, 'Ship invoices').getByRole('img', { name: 'High priority' }),
    ).toBeVisible();

    // the calendar: the week starts on Sunday, as set; both weekly series show
    await goTo(window, 'Calendar');
    await expect(weekDays(window).first()).toHaveText(/^Sun/);
    await expect(main.getByText('Team standup').first()).toBeVisible();
    await expect(main.getByText('Gym')).toBeVisible();

    // the other workspace
    await switchWorkspace(window, 'Side project');
    await goTo(window, 'Tasks');
    await expect(taskRow(main, 'Sketch the raised beds')).toContainText('Garden planner');

    await devbrain.quit();
    const { state } = devbrain;
    for (const id of [WORK, SIDE]) expect(state.appliedMigrations(id)).toEqual(ALL_MIGRATIONS);
    expect(state.rowCounts(WORK, TABLES)).toEqual(before);
    expect(priority('Triage the support inbox')).toBe(0);
    // detached: the user's own task now, its priority theirs
    expect(priority('Write the onboarding guide')).toBe(1);
    expect(priority('Ship invoices')).toBe(3);
    // the series' cancelled and moved occurrences
    expect(state.query(WORK, 'SELECT count(*) AS n FROM event_exceptions')[0]).toEqual({ n: 1 });
    expect(
      state.query(WORK, 'SELECT count(*) AS n FROM events WHERE series_id IS NOT NULL')[0],
    ).toEqual({ n: 1 });
    // each workspace now keeps its own last page
    expect(state.manifest(WORK)).toMatchObject({ name: 'Work', lastPage: `/app/${WORK}/calendar` });
    expect(state.manifest(SIDE)).toMatchObject({
      name: 'Side project',
      lastPage: `/app/${SIDE}/tasks`,
    });
  });

  test('a migration that fails restores the database from the backup taken at open', async ({
    devbrain,
  }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const before = {
      migrations: devbrain.state.appliedMigrations(WORK),
      tasks: devbrain.state.query(WORK, 'SELECT id, project_id, priority FROM tasks ORDER BY id'),
    };

    // A migration that commits but leaves a task pointing at a project that isn't there: runMigrations
    // finds it only after the commit (foreign keys are off while migrating), so the database has
    // changed and must be put back
    const broken = migrationsWithExtra(
      path.join(devbrain.folder, '..', 'migrations-broken'),
      '9999_e2e_broken_reference',
      "UPDATE `tasks` SET `project_id` = 'prj_gone' WHERE `title` = 'Ship invoices';",
    );
    let { window } = await devbrain.launch({ migrationsPath: broken });
    const error = window.getByTestId('workspace-open-error');
    await expect(error).toHaveAttribute('data-error-code', 'workspace_migration');
    await expect(window.getByText('Work couldn’t be updated')).toBeVisible();

    await devbrain.quit();
    // as it was before the open: 0027's update and the broken one undone
    expect(devbrain.state.appliedMigrations(WORK)).toEqual(before.migrations);
    expect(
      devbrain.state.query(WORK, 'SELECT id, project_id, priority FROM tasks ORDER BY id'),
    ).toEqual(before.tasks);

    // and today's app, with its own migrations, opens it
    ({ window } = await devbrain.launch());
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Work');
    await goTo(window, 'Tasks');
    await expect(taskRow(window.getByRole('main'), 'Ship invoices')).toContainText('Billing v2');
    await devbrain.quit();
    expect(devbrain.state.appliedMigrations(WORK)).toEqual(ALL_MIGRATIONS);
  });
});

test.describe('0027: before the archive-to-trash rename', () => {
  const FIXTURE = '0027-before-trash-rename';
  const ID = 'wsp_019a8f00-1c00-7c27-9a27-00000000000c';

  test('opens on its last page, the Trash, and restores from it', async ({ devbrain }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const before = devbrain.state.rowCounts(ID, TABLES);
    const { window } = await devbrain.launch();
    await expect(window).toHaveURL(new RegExp(`#/app/${ID}/trash$`));
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Home lab');

    const main = window.getByRole('main');
    const trash = main.getByRole('grid', { name: 'Trash' });
    const project = trash.getByRole('row', { name: /^Smart lights/ });
    await expect(project).toBeVisible();
    for (const title of ['Pick a hub', 'Wire the hallway', 'Try Proxmox', 'Router config']) {
      await expect(trashRow(trash, title)).toBeVisible();
    }

    // restoring the project brings back the tasks trashed with it
    await project.click({ button: 'right' });
    await window.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(trashRow(trash, 'Pick a hub')).toBeHidden();
    await expect(trashRow(trash, 'Try Proxmox')).toBeVisible();
    await goTo(window, 'Tasks');
    await expect(taskRow(main, 'Pick a hub')).toContainText('Smart lights');
    await expect(taskRow(main, 'Wire the hallway')).toBeVisible();
    await expect(taskRow(main, 'Try Proxmox')).toBeHidden();

    await devbrain.quit();
    expect(devbrain.state.appliedMigrations(ID)).toEqual(ALL_MIGRATIONS);
    expect(devbrain.state.rowCounts(ID, TABLES)).toEqual(before);
    expect(
      devbrain.state.query(ID, 'SELECT title FROM tasks WHERE archived_at IS NOT NULL'),
    ).toEqual([{ title: 'Try Proxmox' }]);
  });
});

test('a database from a newer DevBrain is refused with workspace_too_new', async ({ devbrain }) => {
  const ID = 'wsp_019b0000-0000-7fff-9aff-00000000000d';
  await devbrain.useUpgradeFixture('newer-than-app');
  const before = {
    migrations: devbrain.state.appliedMigrations(ID),
    tasks: devbrain.state.query(ID, 'SELECT * FROM tasks'),
  };
  expect(before.migrations).toHaveLength(ALL_MIGRATIONS.length + 1);

  const { window } = await devbrain.launch();
  const error = window.getByTestId('workspace-open-error');
  await expect(error).toHaveAttribute('data-error-code', 'workspace_too_new');
  await expect(window.getByText('From the future needs a newer DevBrain')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Choose a Workspace' })).toBeVisible();

  // nothing was migrated or written
  await devbrain.quit();
  expect(devbrain.state.appliedMigrations(ID)).toEqual(before.migrations);
  expect(devbrain.state.query(ID, 'SELECT * FROM tasks')).toEqual(before.tasks);
});
