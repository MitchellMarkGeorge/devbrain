import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { createTask, goTo, search } from '../support/ui';

const PROJECT = 'API Gateway Revamp';

test('persistence: quit and relaunch reopens the last workspace on its last page, data intact', async ({
  devbrain,
}) => {
  // a workspace with a few hundred rows, from seed:dev's code
  await devbrain.seed({ name: 'Seeded' });
  let { window } = await devbrain.launch();

  // nothing was open yet: Welcome lists it under recent workspaces
  await window.getByRole('button', { name: /^Seeded Last opened/ }).click();
  await expect(window.getByRole('button', { name: 'Workspace: Seeded' })).toBeVisible();
  const workspaceId = workspaceIdOf(window)!;
  const counts = () =>
    devbrain.state.query(
      workspaceId,
      `SELECT (SELECT count(*) FROM tasks) AS tasks, (SELECT count(*) FROM notes) AS notes,
              (SELECT count(*) FROM projects) AS projects, (SELECT count(*) FROM events) AS events`,
    )[0];
  const seeded = counts();

  // add a task to a project, and leave the window on that project's page
  await createTask(window, { title: 'Persist me', project: PROJECT });
  const results = await search(window, PROJECT);
  await results
    .getByRole('group', { name: /^Projects/ })
    .getByRole('option', { name: new RegExp(PROJECT) })
    .first()
    .click();
  const heading = window.getByRole('main').getByRole('heading', { name: 'Name' });
  await expect(heading).toHaveText(PROJECT);
  await expect(window).toHaveURL(/\/projects\/prj_/);
  const projectPage = new URL(window.url()).hash.slice(1);

  await devbrain.quit();
  expect(devbrain.state.manifest(workspaceId).lastPage).toBe(projectPage);
  expect(devbrain.state.settings().state.lastWorkspaceId).toBe(workspaceId);
  expect(counts()).toEqual({ ...seeded, tasks: (seeded.tasks as number) + 1 });

  // relaunch: straight back to that page, with the task there
  ({ window } = await devbrain.launch());
  await expect(window).toHaveURL(`${window.url().split('#')[0]}#${projectPage}`);
  const main = window.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Name' })).toHaveText(PROJECT);
  await expect(main.getByRole('region', { name: 'Open tasks' })).toContainText('Persist me');

  // and the rest of the workspace is there too
  await goTo(window, 'Notes');
  await expect(main.getByRole('grid', { name: 'Notes' }).getByRole('row').first()).toBeVisible();
});
