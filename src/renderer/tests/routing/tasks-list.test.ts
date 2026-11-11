// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { TaskPriority, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The tasks page's list and group views: rows from tasks.list, the toolbar in the URL, the list
// keys, the selection bar, the states, and Create task.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

function tasksPage(search = '', tasks = SAMPLE) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(WORK, new FakeTasks(tasks.map((task) => ({ ...task }))));
  const app = startApp(main, { url: `/app/${WORK}/tasks${search}` });
  return { main, app };
}

const SAMPLE = [
  fakeTask('tsk_plan', 'Plan the launch', { priority: TaskPriority.HIGH }),
  fakeTask('tsk_build', 'Build the page', { status: TaskStatus.IN_PROGRESS }),
  fakeTask('tsk_ship', 'Ship it', { status: TaskStatus.COMPLETED }),
];

const row = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="row"][data-task-id]')].find((el) =>
    el.textContent?.includes(title),
  );

function key(target: Element, key: string, options: KeyboardEventInit = {}) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );
}

describe('the list view', () => {
  it('lists the open tasks, by the settings’ defaults', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(app.text()).toContain('Plan the launch'));
    expect(app.text()).toContain('Build the page');
    expect(app.text()).not.toContain('Ship it');
    expect(app.text()).toContain('FilterOpen');
  });

  it('shows the tasks a filter in the URL asks for', async () => {
    const { app } = tasksPage('?status=completed');
    await eventually(() => expect(app.text()).toContain('Ship it'));
    expect(app.text()).not.toContain('Plan the launch');
  });

  it('says when no task matches, and clears the filters', async () => {
    const { app } = tasksPage('?status=cancelled&sort=priority');
    await eventually(() => expect(app.text()).toContain('No tasks match these filters'));
    click(byText(app.container, 'button', 'Clear Filters'));
    await eventually(() => expect(app.text()).toContain('Plan the launch'));
    expect(app.path()).toBe(`/app/${WORK}/tasks?sort=priority`);
  });

  it('says when there are no tasks yet', async () => {
    const { app } = tasksPage('', []);
    await eventually(() => expect(app.text()).toContain('No tasks yet'));
  });

  it('switches the view in the URL, replacing the entry', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const length = app.router.history.length;
    click(app.container.querySelector('[aria-label="Grouped"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?view=group`));
    expect(app.router.history.length).toBe(length);
  });

  it('sets the status from the keyboard, at once', async () => {
    const { main } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    row('Plan the launch')!.focus();
    key(row('Plan the launch')!, '2');
    await eventually(() => expect(main.callsTo('tasks.updateStatus')).toHaveLength(1));
    expect(main.callsTo('tasks.updateStatus')[0].input).toEqual({
      id: 'tsk_plan',
      status: TaskStatus.IN_PROGRESS,
    });
  });

  it('selects with X, shows the bar, and moves the selection to the trash with Undo', async () => {
    const { app, main } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    row('Plan the launch')!.focus();
    key(row('Plan the launch')!, 'x');
    await eventually(() => expect(app.text()).toContain('1 selected'));
    key(document.activeElement!, 'Backspace', { metaKey: true });
    await eventually(() => expect(main.callsTo('archive.archiveTask')).toHaveLength(1));
    await eventually(() => expect(document.body.textContent).toContain('Moved to trash'));
    await eventually(() => expect(app.text()).not.toContain('Plan the launch'));
    click(byText(document.body, 'button', 'Undo'));
    await eventually(() => expect(main.callsTo('archive.restoreTask')).toHaveLength(1));
    await eventually(() => expect(app.text()).toContain('Plan the launch'));
  });

  it('leaves ↵ on the bar’s buttons to them, and Clear puts focus back on the list', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    row('Plan the launch')!.focus();
    key(row('Plan the launch')!, 'x');
    await eventually(() => expect(app.text()).toContain('1 selected'));
    const clear = document.querySelector<HTMLElement>('[aria-label="Clear selection"]')!;
    clear.focus();
    // not the list's ↵, which would open the focused task
    key(clear, 'Enter');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.path()).toBe(`/app/${WORK}/tasks`);
    click(clear);
    await eventually(() =>
      expect(document.activeElement?.closest('[data-task-id]')).not.toBeNull(),
    );
  });
});

describe('a task without a due date', () => {
  it('offers Set due date, and sets the date picked', async () => {
    const { main } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const button = row('Plan the launch')!.querySelector('[aria-label="Set due date"]');
    expect(button).not.toBeNull();
    click(button);
    await eventually(() => expect(byText(document.body, 'button', 'Tomorrow')).not.toBeNull());
    click(byText(document.body, 'button', 'Tomorrow'));
    await eventually(() => expect(main.callsTo('tasks.update')).toHaveLength(1));
    expect(main.callsTo('tasks.update')[0].input).toMatchObject({ id: 'tsk_plan' });
    expect((main.callsTo('tasks.update')[0].input as { dueDate: Date }).dueDate).toBeInstanceOf(
      Date,
    );
  });

  it('offers nothing on a closed task', async () => {
    tasksPage('?status=completed');
    await eventually(() => expect(row('Ship it')).toBeDefined());
    expect(row('Ship it')!.querySelector('[aria-label="Set due date"]')).toBeNull();
  });
});

describe('the group view', () => {
  it('draws a heading per status, each over its tasks', async () => {
    const { app } = tasksPage('?view=group&group_by=status');
    await eventually(() => expect(app.text()).toContain('Build the page'));
    const headings = [...app.container.querySelectorAll('[role="row"]:not([data-task-id])')].map(
      (heading) => heading.textContent,
    );
    expect(headings.some((text) => text?.includes('Not started'))).toBe(true);
    expect(headings.some((text) => text?.includes('In progress'))).toBe(true);
    expect(app.text()).toContain('Plan the launch');
  });
});

describe('Create task', () => {
  it('opens with C and creates with the settings’ defaults', async () => {
    const { app, main } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    key(document.body, 'c');
    const title = () => document.querySelector<HTMLInputElement>('input[aria-label="Title"]');
    await eventually(() => expect(title()).not.toBeNull());
    const input = title()!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(input, 'Write the docs');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    click(byText(document.body, 'button', 'Create Task'));
    await eventually(() => expect(main.callsTo('tasks.create')).toHaveLength(1));
    expect(main.callsTo('tasks.create')[0].input).toMatchObject({
      title: 'Write the docs',
      priority: TaskPriority.LOW,
      status: TaskStatus.NOT_STARTED,
    });
    await eventually(() => expect(app.text()).toContain('Write the docs'));
  });
});
