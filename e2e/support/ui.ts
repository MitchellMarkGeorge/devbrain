import { expect, type Locator, type Page } from '@playwright/test';

// Steps several flows share, through what the user sees: roles and accessible names.

type SidebarPage = 'Home' | 'Tasks' | 'Projects' | 'Notes' | 'Calendar' | 'Trash' | 'Settings';

/** Goes to a page from the sidebar. */
export async function goTo(window: Page, name: SidebarPage): Promise<void> {
  await window
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name, exact: true })
    .click();
}

/** Picks an item of the title bar's New menu ("+"): what creates a task, note or project. */
export async function chooseNew(
  window: Page,
  item: 'New task' | 'New note' | 'New project',
): Promise<void> {
  await window.getByRole('button', { name: 'New', exact: true }).click();
  // an item's name may end with its key ("New task C")
  await window.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click();
}

/** The toasts region; a toast is a dialog in it named by its heading. */
export function toasts(window: Page): Locator {
  return window.getByRole('region', { name: 'Notifications' });
}

/** From the Welcome screen (or Create workspace), creates a workspace and waits for its Home. */
export async function createWorkspace(window: Page, name: string): Promise<void> {
  const form = window.getByRole('form', { name: 'Create workspace' });
  if (!(await form.isVisible())) {
    await window.getByRole('button', { name: 'Create Workspace' }).click();
  }
  await form.getByRole('textbox', { name: 'Workspace name' }).fill(name);
  await form.getByRole('button', { name: 'Create Workspace' }).click();
  await expect(window.getByRole('heading', { name: `Welcome to ${name}` })).toBeVisible();
}

/** The workspace switcher's button, in the title bar: "Workspace: <name>". */
export function workspaceButton(window: Page): Locator {
  return window.getByRole('button', { name: /^Workspace: / });
}

/** Switches to another workspace from the switcher, and waits for its button to name it. */
export async function switchWorkspace(window: Page, name: string): Promise<void> {
  await workspaceButton(window).click();
  await window.getByRole('menuitemradio', { name, exact: true }).click();
  await expect(workspaceButton(window)).toHaveAccessibleName(`Workspace: ${name}`);
}

/** Creates a project from the title bar's New menu; ends on the project's page. */
export async function createProject(window: Page, name: string): Promise<void> {
  await goTo(window, 'Projects');
  await chooseNew(window, 'New project');
  const dialog = window.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('button', { name: 'Create Project' }).click();
  await expect(window.getByRole('main').getByRole('heading', { name: 'Name' })).toHaveText(name);
}

export interface NewTask {
  title: string;
  // a quick pick in the due date picker
  due?: 'Today' | 'Tomorrow' | 'Next week';
  project?: string;
}

/** Creates a task on the Tasks page, from the title bar's New menu; ends on the Tasks page. */
export async function createTask(window: Page, task: NewTask): Promise<void> {
  await goTo(window, 'Tasks');
  await chooseNew(window, 'New task');
  const dialog = window.getByRole('dialog', { name: 'New task' });
  await dialog.getByRole('textbox', { name: 'Title' }).fill(task.title);
  if (task.due !== undefined) {
    await dialog.getByRole('button', { name: /^Due / }).click();
    // the picker is a popover, outside the dialog's element
    await window.getByRole('button', { name: task.due, exact: true }).click();
  }
  if (task.project !== undefined) {
    await dialog.getByRole('button', { name: 'Project', exact: true }).click();
    await window.getByRole('menuitemradio', { name: task.project, exact: true }).click();
    await expect(dialog.getByRole('button', { name: task.project, exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Create Task' }).click();
  await expect(dialog).toBeHidden();
}

/** A task's row in a task list. */
export function taskRow(scope: Locator, title: string): Locator {
  // a row is named by everything in it: its status, title, project, priority and due date
  return scope
    .getByRole('row')
    .filter({ has: scope.page().getByText(title, { exact: true }) })
    .first();
}

/** Opens ⌘K search (Ctrl+K off macOS) and types a query. */
export async function search(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+K');
  const dialog = window.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox', { name: 'Search' }).fill(query);
  return dialog;
}
