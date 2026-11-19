import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { createWorkspace } from '../support/ui';

test('first run: Welcome, then Create workspace, lands on Home', async ({ devbrain }) => {
  // an empty DevBrain folder, as the packaged app makes on its first run
  const { window } = await devbrain.launch();

  await expect(window.getByText('Welcome to DevBrain')).toBeVisible();
  await window.getByRole('button', { name: 'Create Workspace' }).click();

  await expect(window.getByRole('heading', { name: 'Create a workspace' })).toBeVisible();
  await createWorkspace(window, 'Personal');

  await expect(window).toHaveURL(/#\/app\/wsp_[^/]+\/home$/);
  await expect(window.getByRole('button', { name: 'Workspace: Personal' })).toBeVisible();
  await expect(window).toHaveTitle(/Home/);

  // the folder holds it: registered, with its manifest and database
  const id = workspaceIdOf(window)!;
  await devbrain.quit();
  expect(devbrain.state.workspaceIds()).toEqual([id]);
  expect(devbrain.state.manifest(id).name).toBe('Personal');
  expect(devbrain.state.settings().state.lastWorkspaceId).toBe(id);
});
