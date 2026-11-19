import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { journalEntries, migrationsWithExtra } from '../support/migrations';
import { goTo, switchWorkspace, taskRow, workspaceButton } from '../support/ui';

// Each test opens a DevBrain folder an earlier version of the app left (e2e/upgrade/fixtures,
// built by scripts/build_upgrade_fixtures.mts) with today's app: its migrations run, its rows
// survive, and its pages show them. The oldest is main as of b0bb3767, the first version of
// DevBrain; docs/testing.md says how to add a fixture when a migration lands.

const TABLES = [
  'projects',
  'tasks',
  'notes',
  'events',
  'calendars',
  'event_exceptions',
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

test.describe('0027: main as of b0bb3767, the first version', () => {
  const FIXTURE = '0027-baseline';
  const HOME_LAB = 'wsp_019a8f00-1c00-7c27-9a27-00000000000c';
  const WORK = 'wsp_019a4a10-2b00-7c26-9a26-00000000000a';

  test('opens: each workspace on its last page, its rows shown and kept', async ({ devbrain }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const before = {
      homeLab: devbrain.state.rowCounts(HOME_LAB, TABLES),
      work: devbrain.state.rowCounts(WORK, TABLES),
    };

    // the workspace open last time, on its last page: the Trash
    const { window } = await devbrain.launch();
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Home lab');
    await expect(window).toHaveURL(new RegExp(`#/app/${HOME_LAB}/trash$`));
    const main = window.getByRole('main');
    const trash = main.getByRole('grid', { name: 'Trash' });
    // a project's row is named by its title first
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
    await expect(taskRow(main, 'Order the drives')).toContainText('Home server');

    // Work opens on its own last page, the calendar: the week starts on Monday (the setting) and
    // both weekly series show, the one from Google and the local one
    await switchWorkspace(window, 'Work');
    await expect(window).toHaveURL(new RegExp(`#/app/${WORK}/calendar$`));
    await expect(weekDays(window).first()).toHaveText(/^Mon/);
    await expect(main.getByText('Team standup').first()).toBeVisible();
    await expect(main.getByText('Gym')).toBeVisible();

    // Linear's tasks with their keys and priorities, "No priority" included
    await goTo(window, 'Tasks');
    const triage = taskRow(main, 'Triage the support inbox');
    await expect(triage.getByRole('button', { name: 'Linear BIL-101' })).toBeVisible();
    await expect(triage.getByRole('img', { name: 'No priority' })).toBeVisible();
    await expect(
      taskRow(main, 'Ship invoices').getByRole('img', { name: 'High priority' }),
    ).toBeVisible();

    // a note, read from its file
    await goTo(window, 'Notes');
    await main
      .getByRole('grid', { name: 'Notes' })
      .getByRole('row', { name: /Standup notes/ })
      .click();
    await expect(main.getByRole('textbox', { name: 'Note' })).toContainText(
      'Billing is blocked on the tax API.',
    );

    await devbrain.quit();
    const { state } = devbrain;
    for (const id of [HOME_LAB, WORK]) {
      expect(state.appliedMigrations(id)).toEqual(ALL_MIGRATIONS);
      expect(state.query(id, 'PRAGMA foreign_key_check')).toEqual([]);
    }
    expect(state.rowCounts(HOME_LAB, TABLES)).toEqual(before.homeLab);
    expect(state.rowCounts(WORK, TABLES)).toEqual(before.work);
    expect(state.query(HOME_LAB, 'SELECT title FROM tasks WHERE archived_at IS NOT NULL')).toEqual([
      { title: 'Try Proxmox' },
    ]);
    expect(state.settings().state.lastWorkspaceId).toBe(WORK);
    expect(state.manifest(HOME_LAB).lastPage).toBe(`/app/${HOME_LAB}/tasks`);
    expect(state.manifest(WORK).lastPage).toBe(
      `/app/${WORK}/notes/nte_019a4a10-2b00-7c26-8b26-000000000001`,
    );
  });

  test('a migration that fails restores the database from the backup taken at open', async ({
    devbrain,
  }) => {
    await devbrain.useUpgradeFixture(FIXTURE);
    const rows = () =>
      devbrain.state.query(HOME_LAB, 'SELECT id, project_id, archived_at FROM tasks ORDER BY id');
    const before = { migrations: devbrain.state.appliedMigrations(HOME_LAB), tasks: rows() };

    // A migration that commits but leaves a task pointing at a project that isn't there:
    // runMigrations finds it only after the commit (foreign keys are off while migrating), so the
    // database has changed and must be put back
    const broken = migrationsWithExtra(
      path.join(devbrain.folder, '..', 'migrations-broken'),
      '9999_e2e_broken_reference',
      "UPDATE `tasks` SET `project_id` = 'prj_gone' WHERE `title` = 'Order the drives';",
    );
    let { window } = await devbrain.launch({ migrationsPath: broken });
    const error = window.getByTestId('workspace-open-error');
    await expect(error).toHaveAttribute('data-error-code', 'workspace_migration');
    await expect(window.getByText('Home lab couldn’t be updated')).toBeVisible();

    await devbrain.quit();
    expect(devbrain.state.appliedMigrations(HOME_LAB)).toEqual(before.migrations);
    expect(rows()).toEqual(before.tasks);

    // and the app, with its own migrations, opens it
    ({ window } = await devbrain.launch());
    await expect(workspaceButton(window)).toHaveAccessibleName('Workspace: Home lab');
    await goTo(window, 'Tasks');
    await expect(taskRow(window.getByRole('main'), 'Order the drives')).toContainText(
      'Home server',
    );
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
