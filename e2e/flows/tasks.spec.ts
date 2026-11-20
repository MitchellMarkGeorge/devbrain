import { test, expect } from '../support/fixtures';
import { workspaceIdOf } from '../support/app';
import { createProject, createTask, createWorkspace, goTo, taskRow, toasts } from '../support/ui';

test('tasks: create, change status, edit, add a subtask, trash, undo, restore', async ({
  devbrain,
}) => {
  const { window } = await devbrain.launch();
  await createWorkspace(window, 'Personal');
  await createProject(window, 'Launch');

  // create, with a due date and a project
  await createTask(window, { title: 'Write release notes', due: 'Tomorrow', project: 'Launch' });
  const main = window.getByRole('main');
  const row = taskRow(main, 'Write release notes');
  await expect(row).toContainText('Launch');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await expect(row).toContainText(
    tomorrow.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  );

  // change its status from the list
  await row.getByRole('button', { name: 'Status: Not started' }).click();
  await window.getByRole('menuitemradio', { name: /^In progress/ }).click();
  await expect(row.getByRole('button', { name: 'Status: In progress' })).toBeVisible();

  // open it
  await row.getByText('Write release notes', { exact: true }).click();
  await expect(main.getByRole('heading', { name: 'Title' })).toHaveText('Write release notes');
  await expect(window).toHaveURL(/\/tasks\/tsk_/);
  const taskId = /\/tasks\/(tsk_[^/?]+)/.exec(window.url())![1];

  // edit the description
  await main.getByRole('textbox', { name: 'Description' }).click();
  await window.keyboard.type('Cover the new sync engine.');

  // add a subtask
  const subtasks = main.getByRole('region', { name: 'Subtasks' });
  await subtasks.getByRole('button', { name: 'Add' }).click();
  const newSubtask = window.getByRole('dialog', { name: 'New subtask' });
  await newSubtask.getByRole('textbox', { name: 'Title' }).fill('Draft changelog');
  await newSubtask.getByRole('button', { name: 'Create Subtask' }).click();
  await expect(taskRow(subtasks, 'Draft changelog')).toBeVisible();
  await expect(subtasks.getByText('0/1')).toBeVisible();
  // the description was saved: it is there once the page has been left and opened again
  await goTo(window, 'Tasks');
  await taskRow(main, 'Write release notes')
    .getByText('Write release notes', { exact: true })
    .click();
  await expect(main.getByRole('textbox', { name: 'Description' })).toHaveText(
    'Cover the new sync engine.',
  );

  // move it to the trash, then Undo
  await moveOpenTaskToTrash(window);
  await expect(window).toHaveURL(/\/tasks$/);
  await expect(taskRow(main, 'Write release notes')).toBeHidden();
  await toasts(window).getByRole('button', { name: 'Undo' }).first().click();
  await expect(taskRow(main, 'Write release notes')).toBeVisible();
  // its subtask came back with it
  await expect(taskRow(main, 'Draft changelog')).toBeVisible();

  // trash it again, and restore it from the Trash page
  await taskRow(main, 'Write release notes')
    .getByText('Write release notes', { exact: true })
    .click();
  await moveOpenTaskToTrash(window);
  await goTo(window, 'Trash');
  const trash = main.getByRole('grid', { name: 'Trash' });
  const trashed = trash.getByRole('row').filter({ hasText: 'Write release notes' });
  await expect(trashed).toBeVisible();
  await trashed.click({ button: 'right' });
  await window.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(main.getByText('Nothing in the trash')).toBeVisible();
  await expect(toasts(window).getByRole('dialog', { name: /Restored/ })).toBeVisible();

  await goTo(window, 'Tasks');
  const restored = taskRow(main, 'Write release notes');
  await expect(restored.getByRole('button', { name: 'Status: In progress' })).toBeVisible();
  await expect(restored).toContainText('Launch');

  // and the database agrees
  const workspaceId = workspaceIdOf(window)!;
  await devbrain.quit();
  const [task] = devbrain.state.query<{ title: string; description: string; archived_at: number }>(
    workspaceId,
    'SELECT title, description, archived_at FROM tasks WHERE id = ?',
    taskId,
  );
  expect(task).toEqual({
    title: 'Write release notes',
    description: 'Cover the new sync engine.',
    archived_at: null,
  });
  const subtaskRows = devbrain.state.query(
    workspaceId,
    'SELECT title FROM tasks WHERE parent_task_id = ? AND archived_at IS NULL',
    taskId,
  );
  expect(subtaskRows).toEqual([{ title: 'Draft changelog' }]);
});

async function moveOpenTaskToTrash(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'More actions' }).click();
  await window.getByRole('menuitem', { name: /^Move to trash/ }).click();
  await window.getByRole('alertdialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(
    toasts(window).getByRole('dialog', { name: 'Moved to trash' }).first(),
  ).toBeVisible();
}
