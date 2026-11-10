// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import { ProjectStatus, TaskStatus } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The projects page (/app/$workspaceId/projects) and a project's page, over a fake main's projects.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

const auth = fakeProject('prj_auth', 'Auth Overhaul', { description: 'Move to PKCE.' });
const billing = fakeProject('prj_billing', 'Billing Revamp', { status: ProjectStatus.COMPLETED });
const empty = fakeProject('prj_empty', 'Mobile Onboarding', { status: ProjectStatus.NOT_STARTED });

function store() {
  return new FakeTasks(
    [
      fakeTask('tsk_pkce', 'Implement PKCE flow', {
        projectId: auth.id,
        status: TaskStatus.IN_PROGRESS,
      }),
      fakeTask('tsk_audit', 'Audit token storage', { projectId: auth.id }),
      fakeTask('tsk_adr', 'Draft ADR', { projectId: auth.id, status: TaskStatus.COMPLETED }),
      fakeTask('tsk_other', 'Unfiled task'),
    ],
    [{ ...auth }, { ...billing }, { ...empty }],
    [fakeNote('nte_pkce', 'PKCE design notes', { projectId: auth.id })],
  );
}

function open(url: string, tasks = store()) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(WORK, tasks);
  const app = startApp(main, { url: `/app/${WORK}${url}` });
  return { main, app, tasks };
}

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setValue.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the projects page', () => {
  it('lists the active projects with their progress from the list’s stats', async () => {
    const { app, main } = open('/projects');
    await eventually(() => expect(app.text()).toContain('Auth Overhaul'));
    expect(app.text()).not.toContain('Billing Revamp');
    // 1 of 3 done (the completed task)
    expect(app.text()).toContain('33%');
    expect(app.text()).toContain('FilterActive');
    expect(main.callsTo('projects.stats')).toEqual([]);
  });

  it('shows every project with the filter in the URL, as cards', async () => {
    const { app } = open('/projects?status=all&view=card');
    await eventually(() => expect(app.text()).toContain('Billing Revamp'));
    expect(app.text()).toContain('1 of 3 tasks done');
  });

  it('says when no project matches, and clears the filter', async () => {
    const { app } = open('/projects?status=on_hold');
    await eventually(() => expect(app.text()).toContain('No projects match this filter'));
    click(byText(app.container, 'button', 'Clear Filters'));
    await eventually(() => expect(app.text()).toContain('Auth Overhaul'));
    expect(app.path()).toBe(`/app/${WORK}/projects`);
  });

  it('opens a project from its row', async () => {
    const { app } = open('/projects');
    await eventually(() => expect(app.text()).toContain('Auth Overhaul'));
    click(app.container.querySelector(`[data-project-id="${auth.id}"]`));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects/${auth.id}`));
  });

  it('creates a project with its first tasks in one call, then opens it', async () => {
    const { app, main } = open('/projects');
    await eventually(() => expect(app.text()).toContain('Auth Overhaul'));
    click(byText(app.container, 'button', 'New Project'));
    const name = () => document.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    await eventually(() => expect(name()).not.toBeNull());
    typeInto(name()!, 'Passkey Support');
    const task = document.querySelector<HTMLInputElement>('input[aria-label="Add a task…"]')!;
    for (const title of ['Audit WebAuthn libraries', 'Design the enrolment flow']) {
      typeInto(task, title);
      task.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      await eventually(() => expect(document.body.textContent).toContain(title));
    }
    click(byText(document.body, 'button', 'Create Project'));
    await eventually(() => expect(main.callsTo('projects.create')).toHaveLength(1));
    expect(main.callsTo('projects.create')[0].input).toMatchObject({
      title: 'Passkey Support',
      status: ProjectStatus.NOT_STARTED,
      color: '#2b7fff',
      tasks: [{ title: 'Audit WebAuthn libraries' }, { title: 'Design the enrolment flow' }],
    });
    expect(main.callsTo('tasks.create')).toEqual([]);
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects/prj_new4`));
    await eventually(() => expect(app.text()).toContain('Audit WebAuthn libraries'));
  });
});

describe('a project’s page', () => {
  it('shows the overview: the header, its progress and the tasks by status, and records the view', async () => {
    const { app, main } = open(`/projects/${auth.id}`);
    await eventually(() => expect(app.text()).toContain('Implement PKCE flow'));
    const overview = app.container.querySelector('[data-testid="project-overview"]')!;
    expect(overview.textContent).toContain('Auth Overhaul');
    expect(overview.textContent).toContain('Active');
    await eventually(() => expect(overview.textContent).toContain('1 of 3 done'));
    expect(overview.textContent).toContain('Audit token storage');
    expect(overview.textContent).not.toContain('Unfiled task');
    expect(main.callsTo('recents.recordView').map((call) => call.input)).toEqual([{ id: auth.id }]);
  });

  it('lays the overview out as the work and a rail, with the rest a click away in the Tasks tab', async () => {
    const tasks = store();
    for (let i = 1; i <= 8; i++) {
      tasks.tasks.push(fakeTask(`tsk_more${i}`, `Follow-up ${i}`, { projectId: auth.id }));
    }
    const { app } = open(`/projects/${auth.id}`, tasks);
    await eventually(() => expect(app.text()).toContain('Implement PKCE flow'));
    const section = (id: string) => app.container.querySelector(`[data-testid="${id}"]`)!;
    // 10 open tasks, 8 shown
    const openTasks = section('overview-open');
    expect(openTasks.textContent).toContain('Open tasks');
    expect(openTasks.querySelectorAll('[data-task-id]')).toHaveLength(8);
    expect(section('overview-done').textContent).toContain('Draft ADR');
    // the rail: progress split by status, the timeline and the latest notes
    const rail = app.container.querySelector('[aria-label="Project at a glance"]')!;
    expect(rail.textContent).toContain('1 of 11 tasks done');
    expect(rail.textContent).toContain('No due date');
    expect(rail.textContent).toContain('PKCE design notes');
    click(byText(openTasks, 'button', '2 more in Tasks'));
    await eventually(() =>
      expect(app.path()).toBe(`/app/${WORK}/projects/${auth.id}?tab=tasks&status=open`),
    );
  });

  it('shows not-found for a project that doesn’t exist', async () => {
    const { app } = open('/projects/prj_gone');
    await eventually(() => expect(app.text()).toContain('There’s nothing here'));
  });

  it('offers New Task on a project with no tasks', async () => {
    const { app } = open(`/projects/${empty.id}`);
    await eventually(() => expect(app.text()).toContain('No tasks in this project yet'));
    expect(byText(app.container, 'button', 'Move Tasks Here')).not.toBeNull();
  });

  it('changes the status through its pill', async () => {
    const { app, main } = open(`/projects/${auth.id}`);
    await eventually(() => expect(app.text()).toContain('Implement PKCE flow'));
    const overview = app.container.querySelector('[data-testid="project-overview"]')!;
    click(byText(overview, 'button', 'Active'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitemradio"]', 'On hold')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitemradio"]', 'On hold'));
    await eventually(() => expect(main.callsTo('projects.updateStatus')).toHaveLength(1));
    expect(main.callsTo('projects.updateStatus')[0].input).toEqual({
      id: auth.id,
      status: ProjectStatus.ON_HOLD,
    });
  });

  it('switches tabs in the URL, replacing the entry', async () => {
    const { app } = open(`/projects/${auth.id}`);
    await eventually(() => expect(app.text()).toContain('Implement PKCE flow'));
    const length = app.router.history.length;
    click(byText(app.container, '[role="tab"]', 'Notes'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects/${auth.id}?tab=notes`));
    expect(app.router.history.length).toBe(length);
    await eventually(() => expect(app.text()).toContain('PKCE design notes'));
  });

  it('lists only the project’s tasks on its Tasks tab, with no project filter', async () => {
    const { app } = open(`/projects/${auth.id}?tab=tasks&status=all`);
    await eventually(() => expect(app.text()).toContain('Audit token storage'));
    expect(app.text()).toContain('Draft ADR');
    expect(app.text()).not.toContain('Unfiled task');
    click(byText(app.container, 'button', 'Filter'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Status')).not.toBeNull(),
    );
    expect(byText(document.body, '[role="menuitem"]', 'Project')).toBeNull();
  });

  it('files a task created from its Tasks tab in the project', async () => {
    const { app, main } = open(`/projects/${auth.id}?tab=tasks`);
    await eventually(() => expect(app.text()).toContain('Audit token storage'));
    click(byText(app.container, 'button', 'New Task'));
    const title = () => document.querySelector<HTMLInputElement>('input[aria-label="Title"]');
    await eventually(() => expect(title()).not.toBeNull());
    typeInto(title()!, 'Rotate keys');
    click(byText(document.body, 'button', 'Create Task'));
    await eventually(() => expect(main.callsTo('tasks.create')).toHaveLength(1));
    expect(main.callsTo('tasks.create')[0].input).toMatchObject({
      title: 'Rotate keys',
      projectId: auth.id,
    });
  });
});
