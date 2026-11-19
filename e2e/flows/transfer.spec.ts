import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { answerOpenDialog, answerSaveDialog } from '../support/dialogs';
import { readJson } from '../support/folder';
import {
  createProject,
  createTask,
  createWorkspace,
  goTo,
  taskRow,
  toasts,
  workspaceButton,
} from '../support/ui';

test('import and export: tasks exported to JSON import into another workspace', async ({
  devbrain,
}) => {
  const { app, window } = await devbrain.launch();
  const main = window.getByRole('main');
  await createWorkspace(window, 'Personal');
  await createProject(window, 'Launch');
  await createTask(window, { title: 'Write release notes', due: 'Tomorrow', project: 'Launch' });
  await createTask(window, { title: 'Book dentist' });

  // export, answering the save dialog with a file in the test's folder
  const file = path.join(devbrain.folder, '..', 'tasks.json');
  await answerSaveDialog(app, file);
  await openImportExport(window);
  const transfers = main.getByRole('region', { name: 'Import & export' });
  await transfers.getByRole('button', { name: 'Export' }).first().click();
  await window.getByRole('menuitem', { name: 'JSON' }).click();
  await expect(toasts(window)).toContainText(/2 tasks/);

  const exported = readJson<{ format: string; tasks: { title: string; project: string | null }[] }>(
    file,
  );
  expect(exported.format).toBe('devbrain.tasks');
  expect(exported.tasks.map((t) => [t.title, t.project]).sort()).toEqual([
    ['Book dentist', null],
    ['Write release notes', 'Launch'],
  ]);

  // a second workspace, and import the file there. Import matches projects by title and never
  // makes one (docs/import-export.md), so Work has its own Launch
  await workspaceButton(window).click();
  await window.getByRole('menuitem', { name: 'New workspace…' }).click();
  await createWorkspace(window, 'Work');
  const workId = workspaceIdOf(window)!;
  await createProject(window, 'Launch');
  await answerOpenDialog(app, [file]);
  await openImportExport(window);
  await transfers.getByRole('button', { name: 'Choose File', exact: true }).click();
  const summary = window.getByRole('dialog', { name: 'Imported 2 tasks' });
  // nothing skipped, nothing imported without its project
  await expect(summary).toContainText('Into Work.');
  await expect(summary).not.toContainText('skipped');
  await expect(summary).not.toContainText('imported without');
  await summary.getByRole('button', { name: /^View/ }).click();
  await expect(window).toHaveURL(new RegExp(`#/app/${workId}/tasks`));
  await expect(taskRow(main, 'Write release notes')).toContainText('Launch');
  await expect(taskRow(main, 'Book dentist')).toBeVisible();

  await devbrain.quit();
  expect(
    devbrain.state.query(workId, 'SELECT title FROM tasks ORDER BY title').map((r) => r.title),
  ).toEqual(['Book dentist', 'Write release notes']);
  expect(devbrain.state.query(workId, 'SELECT title FROM projects')).toEqual([{ title: 'Launch' }]);
});

async function openImportExport(window: Page) {
  await goTo(window, 'Settings');
  await window
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Import & export' })
    .click();
}
