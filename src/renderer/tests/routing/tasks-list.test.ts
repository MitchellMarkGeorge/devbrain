import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { TaskPriority, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeTask, FakeTasks } from './fake-tasks';
import {
  byText,
  click,
  eventually,
  filterButton,
  filterCount,
  startApp,
  stopApps,
} from './harness';

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

/** A filter's values as the URL holds several: a JSON list. */
const list = (...values: string[]) => encodeURIComponent(JSON.stringify(values));

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
    expect(app.text()).toContain('StatusOpen');
    // the title bar's New creates a task: the toolbar has no button for it
    expect(byText(app.container, 'button', 'New Task')).toBeNull();
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
    click(byText(app.container, 'button', 'Display'));
    await eventually(() => expect(byText(document.body, 'button', 'Board')).not.toBeNull());
    click(byText(document.body, 'button', 'Board'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?view=board`));
    expect(app.router.history.length).toBe(length);
  });

  it('sets the status from the Status chip, the default leaving the URL', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const pick = async (status: string) => {
      click(byText(app.container, 'button', 'Status'));
      await eventually(() =>
        expect(byText(document.body, '[role="menuitemradio"]', status)).not.toBeNull(),
      );
      click(byText(document.body, '[role="menuitemradio"]', status));
    };
    await pick('Completed');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?status=completed`));
    await eventually(() => expect(row('Ship it')).toBeDefined());
    await pick('Open');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
  });

  it('sets a filter from a submenu of the Filter menu, and removes it with Any', async () => {
    const { app, main } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const field = (label: string) => byText(document.body, '[role="menuitem"]', label);
    // priority holds several values: its values tick on their own
    const value = (label: string) => byText(document.body, '[role="menuitemcheckbox"]', label);
    // opens Filter › Priority, whatever is open already
    const openPriority = async () => {
      if (value('Any')) return;
      if (!field('Priority')) click(filterButton(app.container));
      await eventually(() => expect(field('Priority')).not.toBeNull());
      click(field('Priority'));
      await eventually(() => expect(value('Any')).not.toBeNull());
    };
    await openPriority();
    // a submenu for each field
    for (const label of ['Due', 'Source', 'Project']) expect(field(label)).not.toBeNull();
    click(value('High'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?priority=${list('high')}`));
    await eventually(() =>
      expect(main.callsTo('tasks.tree').at(-1)!.input).toMatchObject({
        filter: { priority: [TaskPriority.HIGH] },
      }),
    );
    // the filter's chip
    await eventually(() => expect(filterCount(app.container)).toBe(1));
    await openPriority();
    click(value('Any'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
  });

  it('ticks a second value of a filter, and removes the filter by unticking the last', async () => {
    const { app, main } = tasksPage('', [
      ...SAMPLE,
      fakeTask('tsk_test', 'Test the page', { priority: TaskPriority.MEDIUM }),
    ]);
    await eventually(() => expect(row('Build the page')).toBeDefined());
    const value = (label: string) => byText(document.body, '[role="menuitemcheckbox"]', label);
    click(filterButton(app.container));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Priority')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Priority'));
    await eventually(() => expect(value('High')).not.toBeNull());
    click(value('High'));
    await eventually(() => expect(value('High')!.getAttribute('aria-checked')).toBe('true'));
    // the menu stays open for the next one
    click(value('Medium'));
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/tasks?priority=${list('high', 'medium')}`),
    );
    await eventually(() =>
      expect(main.callsTo('tasks.tree').at(-1)!.input).toMatchObject({
        filter: { priority: [TaskPriority.HIGH, TaskPriority.MEDIUM] },
      }),
    );
    // any of them: the high and the medium task, not the low ones
    await eventually(() => expect(row('Build the page')).toBeUndefined());
    expect(row('Plan the launch')).toBeDefined();
    expect(row('Test the page')).toBeDefined();
    // one filter, however many values: one chip
    expect(filterCount(app.container)).toBe(1);
    // the field's item in the menu names both
    expect(
      [...document.body.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toContain('PriorityHigh, Medium');
    click(value('High'));
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/tasks?priority=${list('medium')}`),
    );
    await eventually(() => expect(value('High')!.getAttribute('aria-checked')).toBe('false'));
    click(value('Medium'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks`));
    await eventually(() => expect(row('Build the page')).toBeDefined());
  });

  it('reads a filter’s one value from a link made before it could hold several', async () => {
    const { main } = tasksPage('?priority=high&source=local');
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    expect(row('Build the page')).toBeUndefined();
    expect(main.callsTo('tasks.tree').at(-1)!.input).toMatchObject({
      filter: { priority: [TaskPriority.HIGH], origin: 'local' },
    });
  });

  it('draws a chip for a filter that is set, and removes the filter from its ×', async () => {
    const { app } = tasksPage(`?priority=${list('high', 'medium')}&source=local`);
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const chips = () =>
      [...app.container.querySelectorAll('[data-chip]')].map((chip) => chip.textContent);
    expect(chips()).toEqual(['PriorityHigh, Medium', 'SourceLocal']);
    expect(filterCount(app.container)).toBe(2);
    click(app.container.querySelector('[aria-label="Remove Priority filter"]'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?source=local`));
    await eventually(() => expect(chips()).toEqual(['SourceLocal']));
  });

  it('keeps a filter that holds one value a choice of one', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    click(filterButton(app.container));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Source')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Source'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitemradio"]', 'Synced')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitemradio"]', 'Synced'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?source=external`));
  });

  it('groups by a filtered field into the chosen groups only', async () => {
    const { app } = tasksPage(`?view=group&group_by=priority&priority=${list('high', 'medium')}`, [
      ...SAMPLE,
      fakeTask('tsk_test', 'Test the page', { priority: TaskPriority.MEDIUM }),
    ]);
    await eventually(() => expect(row('Test the page')).toBeDefined());
    const headings = [...app.container.querySelectorAll('[role="row"]:not([data-task-id])')].map(
      (heading) => heading.textContent ?? '',
    );
    expect(headings.some((text) => text.includes('High'))).toBe(true);
    expect(headings.some((text) => text.includes('Medium'))).toBe(true);
    expect(headings.some((text) => text.includes('Low'))).toBe(false);
    expect(row('Build the page')).toBeUndefined();
  });

  it('groups the list from Display, and ungroups it with None', async () => {
    const { app } = tasksPage();
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    const option = (label: string) => byText(document.body, '[role="option"]', label);
    const groupBy = async (label: string) => {
      click(document.querySelector('[aria-label="Group by"]'));
      await eventually(() => expect(option(label)).not.toBeNull());
      click(option(label));
    };
    click(byText(app.container, 'button', 'Display'));
    await eventually(() =>
      expect(document.querySelector('[aria-label="Group by"]')).not.toBeNull(),
    );
    await groupBy('Status');
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/tasks?view=group&group_by=status`),
    );
    await groupBy('None');
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/tasks?view=list`));
  });

  it('starts a parent of more than 50 subtasks folded, and loads them when it is shown', async () => {
    const parent = fakeTask('tsk_big', 'Migrate every endpoint', {
      priority: TaskPriority.HIGH,
      subtaskProgress: { completed: 0, total: 51 },
    });
    const subtasks = Array.from({ length: 51 }, (_, n) =>
      fakeTask(`tsk_big_${n}`, `Endpoint ${n + 1}`, { parentTaskId: parent.id }),
    );
    const { main } = tasksPage('', [parent, ...subtasks]);
    await eventually(() => expect(row('Migrate every endpoint')).toBeDefined());
    // sent alone: its count shows it folded, and none of its rows is loaded
    const toggle = () =>
      row('Migrate every endpoint')!.querySelector<HTMLElement>('[data-subtasks-toggle]')!;
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(row('Endpoint 1')).toBeUndefined();
    expect(main.callsTo('tasks.subtree')).toHaveLength(0);

    click(toggle());
    // the list draws only the rows in view: the first of them
    await eventually(() => expect(row('Endpoint 1')).toBeDefined());
    expect(main.callsTo('tasks.subtree')[0].input).toMatchObject({ id: 'tsk_big' });
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('forgets a parent’s folded subtasks once it leaves the list', async () => {
    const parent = fakeTask('tsk_parent', 'Ship the release', {
      priority: TaskPriority.HIGH,
      subtaskProgress: { completed: 0, total: 1 },
    });
    const child = fakeTask('tsk_child', 'Write the notes', { parentTaskId: parent.id });
    const { app, main } = tasksPage('', [parent, child]);
    await eventually(() => expect(row('Write the notes')).toBeDefined());
    // folded
    click(row('Ship the release')!.querySelector('[data-subtasks-toggle]'));
    await eventually(() => expect(row('Write the notes')).toBeUndefined());

    // to the trash and back: the list drops it, then has it again
    row('Ship the release')!.focus();
    key(row('Ship the release')!, 'x');
    await eventually(() => expect(app.text()).toContain('1 selected'));
    key(document.activeElement!, 'Backspace', { metaKey: true });
    await eventually(() => expect(main.callsTo('archive.archiveTask')).toHaveLength(1));
    await eventually(() => expect(row('Ship the release')).toBeUndefined());
    click(byText(document.body, 'button', 'Undo'));
    await eventually(() => expect(row('Ship the release')).toBeDefined());
    // its subtasks show, as a parent's do at first
    await eventually(() => expect(row('Write the notes')).toBeDefined());
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

describe('the undo stack', () => {
  const HOME = 'wsp_home' as WorkspaceId;

  /** Work's tasks page, with "Plan the launch" moved to the trash: one entry on the undo stack */
  async function trashedOne() {
    const main = new FakeMain([workspace(WORK, 'Work'), workspace(HOME, 'Home')], WORK);
    main.taskStores.set(WORK, new FakeTasks(SAMPLE.map((task) => ({ ...task }))));
    const app = startApp(main, { url: `/app/${WORK}/tasks` });
    await eventually(() => expect(row('Plan the launch')).toBeDefined());
    row('Plan the launch')!.focus();
    key(row('Plan the launch')!, 'x');
    await eventually(() => expect(app.text()).toContain('1 selected'));
    key(document.activeElement!, 'Backspace', { metaKey: true });
    await eventually(() => expect(main.callsTo('archive.archiveTask')).toHaveLength(1));
    return { main, app };
  }

  const undo = () => key(document.body, 'z', { metaKey: true });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('keeps its entries on going to Create workspace and coming back', async () => {
    const { main, app } = await trashedOne();
    await app.router.navigate({ to: '/workspaces/new' });
    await eventually(() => expect(app.path()).toBe('/workspaces/new'));
    app.router.history.back();
    await eventually(() => expect(app.text()).toContain('Build the page'));
    undo();
    await eventually(() => expect(main.callsTo('archive.restoreTask')).toHaveLength(1));
  });

  it('drops its entries on going from Create workspace into another workspace', async () => {
    const { main, app } = await trashedOne();
    await app.router.navigate({ to: '/workspaces/new' });
    await eventually(() => expect(app.path()).toBe('/workspaces/new'));
    await app.router.navigate({ to: '/app/$workspaceId/tasks', params: { workspaceId: HOME } });
    await eventually(() => expect(main.open).toBe(HOME));
    await eventually(() => expect(app.path()).toBe(`/app/${HOME}/tasks`));
    undo();
    await tick();
    expect(main.callsTo('archive.restoreTask')).toHaveLength(0);
  });

  it('drops its entries on a switch to another workspace', async () => {
    const { main, app } = await trashedOne();
    await app.router.navigate({ to: '/app/$workspaceId/tasks', params: { workspaceId: HOME } });
    await eventually(() => expect(main.open).toBe(HOME));
    await eventually(() => expect(app.path()).toBe(`/app/${HOME}/tasks`));
    undo();
    await tick();
    expect(main.callsTo('archive.restoreTask')).toHaveLength(0);
  });
});
