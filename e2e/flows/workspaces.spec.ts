import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import {
  createTask,
  createWorkspace,
  goTo,
  switchWorkspace,
  taskRow,
  workspaceButton,
} from '../support/ui';

test('switching: a second workspace, switch, switch back; each keeps its data and last page', async ({
  devbrain,
}) => {
  const { window } = await devbrain.launch();
  const main = window.getByRole('main');

  // Personal: a task, left on Tasks
  await createWorkspace(window, 'Personal');
  const personalId = workspaceIdOf(window)!;
  await createTask(window, { title: 'Book dentist' });

  // Work: made from the switcher, with its own task, left on Projects
  await workspaceButton(window).click();
  await window.getByRole('menuitem', { name: 'New workspace…' }).click();
  await createWorkspace(window, 'Work');
  const workId = workspaceIdOf(window)!;
  expect(workId).not.toBe(personalId);
  await createTask(window, { title: 'Review pull requests' });
  await expect(taskRow(main, 'Book dentist')).toBeHidden();
  await goTo(window, 'Projects');

  // back to Personal: its last page, and only its own task
  await switchWorkspace(window, 'Personal');
  await expect(window).toHaveURL(new RegExp(`#/app/${personalId}/tasks$`));
  await expect(taskRow(main, 'Book dentist')).toBeVisible();
  await expect(taskRow(main, 'Review pull requests')).toBeHidden();

  // and to Work again: Projects, where it was left
  await switchWorkspace(window, 'Work');
  await expect(window).toHaveURL(new RegExp(`#/app/${workId}/projects$`));
  await goTo(window, 'Tasks');
  await expect(taskRow(main, 'Review pull requests')).toBeVisible();
  await expect(taskRow(main, 'Book dentist')).toBeHidden();

  // each manifest keeps its own last page; the last workspace open is Work
  await devbrain.quit();
  const { state } = devbrain;
  expect(state.manifest(personalId).lastPage).toBe(`/app/${personalId}/tasks`);
  expect(state.manifest(workId).lastPage).toBe(`/app/${workId}/tasks`);
  expect(state.settings().state.lastWorkspaceId).toBe(workId);
  expect(state.query(personalId, 'SELECT title FROM tasks')).toEqual([{ title: 'Book dentist' }]);
  expect(state.query(workId, 'SELECT title FROM tasks')).toEqual([
    { title: 'Review pull requests' },
  ]);
});
