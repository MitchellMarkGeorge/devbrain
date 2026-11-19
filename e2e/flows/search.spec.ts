import { test, expect } from '../support/fixtures';
import { createTask, createWorkspace, goTo, search } from '../support/ui';

test('⌘K search finds the task and the note', async ({ devbrain }) => {
  const { window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');
  await createTask(window, { title: 'Write release notes' });
  await goTo(window, 'Notes');
  const main = window.getByRole('main');
  await main.getByRole('button', { name: 'New Note' }).first().click();
  await main.getByRole('heading', { name: 'Title' }).click();
  await window.keyboard.type('Release retro');
  await main.getByRole('textbox', { name: 'Note' }).click();
  await window.keyboard.type('What went well this release.');
  await goTo(window, 'Home');

  const results = await search(window, 'release');
  await expect(results.getByRole('button', { name: 'Tasks 1' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'Notes 1' })).toBeVisible();
  const listbox = results.getByRole('listbox');
  await expect(listbox.getByRole('option', { name: /Write release notes/ })).toBeVisible();
  const noteResult = listbox.getByRole('option', { name: /Release retro/ });
  await expect(noteResult).toBeVisible();

  // a result opens its page
  await noteResult.click();
  await expect(results).toBeHidden();
  await expect(window).toHaveURL(/\/notes\/nte_/);
  await expect(main.getByRole('heading', { name: 'Title' })).toHaveText('Release retro');
});
