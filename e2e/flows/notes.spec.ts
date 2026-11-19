import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { createTask, createWorkspace, goTo, taskRow } from '../support/ui';

test('notes: create, type, leave and come back, link a task', async ({ devbrain }) => {
  const { window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');
  await createTask(window, { title: 'Write release notes' });

  // create a note, and give it a title
  await goTo(window, 'Notes');
  const main = window.getByRole('main');
  await main.getByRole('button', { name: 'New Note' }).first().click();
  await expect(window).toHaveURL(/\/notes\/nte_/);
  const noteId = /\/notes\/(nte_[^/?]+)/.exec(window.url())![1];
  const title = main.getByRole('heading', { name: 'Title' });
  await title.click();
  await window.keyboard.type('Retro notes');
  await window.keyboard.press('Enter');

  // type in it
  const body = main.getByRole('textbox', { name: 'Note' });
  await body.click();
  await window.keyboard.type('Ship smaller releases.');

  // leave: the list shows what autosave wrote
  await goTo(window, 'Notes');
  const row = main.getByRole('grid', { name: 'Notes' }).getByRole('row', { name: /Retro notes/ });
  await expect(row).toContainText('Ship smaller releases.');

  // and come back: the text is there
  await row.click();
  await expect(main.getByRole('heading', { name: 'Title' })).toHaveText('Retro notes');
  await expect(body).toHaveText('Ship smaller releases.');

  // link a task
  await main.getByRole('button', { name: 'Add task' }).click();
  await window.getByRole('menuitem', { name: 'Link existing task' }).click();
  await window.getByRole('searchbox', { name: 'Search tasks' }).fill('release');
  await window.getByRole('menuitem', { name: /Write release notes/ }).click();
  const linked = main.getByRole('region', { name: 'Tasks' });
  await expect(taskRow(linked, 'Write release notes')).toBeVisible();

  // the note's file and row hold it
  const workspaceId = workspaceIdOf(window)!;
  await devbrain.quit();
  const [note] = devbrain.state.query<{ title: string; preview: string }>(
    workspaceId,
    'SELECT title, preview FROM notes WHERE id = ?',
    noteId,
  );
  expect(note).toEqual({ title: 'Retro notes', preview: 'Ship smaller releases.' });
  const [task] = devbrain.state.query<{ linked_note_id: string }>(
    workspaceId,
    "SELECT linked_note_id FROM tasks WHERE title = 'Write release notes'",
  );
  expect(task.linked_note_id).toBe(noteId);
});
