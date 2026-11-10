// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { IntegrationId, WorkspaceId } from '@common/ids';
import { AuthType, IntegrationStatus, Provider, TaskStatus } from '@common/types';
import { event, id } from '../calendar/fixtures';
import { FakeMain, workspace } from './fake-main';
import { fakeNote, fakeProject, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// Home over the fake main: the greeting, the summary and the one section from the workspace's
// data, the capture box creating a task, note or event, and the footer. The app's clock is the
// real one, so the data is placed around now.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

const today = () => DateTime.now().startOf('day');
const minutesFromNow = (minutes: number) => DateTime.now().plus({ minutes }).toJSDate();

function home(store: FakeTasks, setup: (main: FakeMain) => void = () => {}) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.taskStores.set(WORK, store);
  main.storeProjects = true;
  setup(main);
  const app = startApp(main, { url: `/app/${WORK}/home` });
  return { main, app };
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function enter(input: HTMLInputElement) {
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
}

const field = () => document.querySelector<HTMLInputElement>('input[aria-label^="New "]')!;

const TASKS = () => [
  fakeTask('tsk_late', 'Audit token storage', { dueDate: today().minus({ days: 2 }).toJSDate() }),
  fakeTask('tsk_today', 'Implement PKCE', { dueDate: today().toJSDate() }),
  fakeTask('tsk_later', 'Write the docs', { dueDate: today().plus({ days: 3 }).toJSDate() }),
  fakeTask('tsk_done', 'Ship it', { dueDate: today().toJSDate(), status: TaskStatus.COMPLETED }),
];

describe('Home', () => {
  it('greets without a name, sums up the day and lists the tasks due', async () => {
    const { app } = home(new FakeTasks(TASKS()));
    await eventually(() => expect(app.text()).toContain('Implement PKCE'));
    expect(app.text()).toMatch(/Good (morning|afternoon|evening)/);
    expect(app.text()).toContain('You have 2 tasks today, and 1 is overdue.');
    expect(app.text()).toContain('Audit token storage');
    expect(app.text()).toContain('All 2 tasks');
    expect(app.text()).not.toContain('Write the docs');
    expect(app.text()).not.toContain('Ship it');
  });

  it('shows the meeting coming up, with Join once it is running', async () => {
    const { app } = home(new FakeTasks([fakeTask('tsk_a', 'Someday')]), (main) => {
      main.calendarEvents.push(
        event({
          id: id('evt_sync'),
          title: 'Design sync',
          startAt: minutesFromNow(-10),
          endAt: minutesFromNow(20),
          meetingUrl: 'https://meet.example/sync',
        }),
        event({
          id: id('evt_review'),
          title: 'Design review',
          startAt: minutesFromNow(30),
          endAt: minutesFromNow(60),
          meetingUrl: 'https://meet.example/review',
        }),
      );
    });
    await eventually(() => expect(app.text()).toContain('Design sync is on now.'));
    expect(app.text()).toContain('Meetings');
    expect(app.text()).toContain('Design review');
    // Join on the running meeting only: the next one is more than 5 minutes away
    expect(
      [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Join'),
    ).toHaveLength(1);
  });

  it('shows recent notes when nothing is coming up', async () => {
    const store = new FakeTasks(
      [fakeTask('tsk_a', 'Someday')],
      [],
      [fakeNote('nte_pkce', 'PKCE notes')],
    );
    const { app } = home(store);
    await eventually(() => expect(app.text()).toContain('Recent notes'));
    expect(app.text()).toContain('PKCE notes');
    expect(app.text()).toContain('Your day is clear');
  });

  it('welcomes a new workspace by its name, with Get started', async () => {
    const { app } = home(new FakeTasks([]), (main) => (main.integrations = []));
    await eventually(() => expect(app.text()).toContain('Welcome to Work'));
    expect(app.text()).toContain('Connect Google Calendar');
    expect(app.text()).toContain('Connect Linear');
    expect(app.text()).toContain('Start a project');
    click(byText(app.container, 'button', 'Create'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/projects`));
  });

  it('offers Reconnect in the footer when an integration needs signing in again', async () => {
    const { app } = home(new FakeTasks(TASKS()), (main) => {
      main.integrations = [
        {
          id: 'int_google' as IntegrationId,
          provider: Provider.GOOGLE_CALENDAR,
          authType: AuthType.OAUTH,
          accountLabel: 'me@example.com',
          status: IntegrationStatus.NEEDS_REAUTH,
          sources: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    });
    await eventually(() => expect(app.text()).toContain('Google Calendar paused'));
    click(byText(app.container, 'button', 'Reconnect'));
    await eventually(() => expect(app.path()).toBe(`/app/${WORK}/integrations`));
  });

  it('creates a task from the capture box, with the date and project it names', async () => {
    const launch = fakeProject('prj_launch', 'Launch');
    const { main, app } = home(new FakeTasks(TASKS(), [launch]));
    await eventually(() => expect(app.text()).toContain('Implement PKCE'));
    type(field(), 'Write the plan tomorrow #Launch');
    await eventually(() => expect(document.querySelector('mark')?.textContent).toBe('tomorrow'));
    enter(field());
    await eventually(() => expect(main.callsTo('tasks.create')).toHaveLength(1));
    expect(main.callsTo('tasks.create')[0].input).toMatchObject({
      title: 'Write the plan',
      dueDate: today().plus({ days: 1 }).toJSDate(),
      projectId: 'prj_launch',
    });
    await eventually(() => expect(field().value).toBe(''));
  });

  it('creates a note and opens it', async () => {
    const { main, app } = home(new FakeTasks(TASKS()));
    await eventually(() => expect(app.text()).toContain('Implement PKCE'));
    click(byText(app.container, 'button', 'Note'));
    await eventually(() => expect(field().getAttribute('aria-label')).toBe('New note'));
    type(field(), 'Sprint ideas');
    enter(field());
    await eventually(() => expect(main.callsTo('notes.create')).toHaveLength(1));
    expect(main.callsTo('notes.create')[0].input).toMatchObject({ title: 'Sprint ideas' });
    await eventually(() => expect(app.path()).toMatch(new RegExp(`^/app/${WORK}/notes/nte_`)));
  });

  it('creates an event at the day and time named', async () => {
    const { main, app } = home(new FakeTasks(TASKS()));
    await eventually(() => expect(app.text()).toContain('Implement PKCE'));
    click(byText(app.container, 'button', 'Event'));
    await eventually(() => expect(field().getAttribute('aria-label')).toBe('New event'));
    type(field(), 'Design sync tomorrow at 3pm');
    enter(field());
    await eventually(() => expect(main.callsTo('events.create')).toHaveLength(1));
    const start = today().plus({ days: 1, hours: 15 });
    expect(main.callsTo('events.create')[0].input).toMatchObject({
      title: 'Design sync',
      startAt: start.toJSDate(),
      endAt: start.plus({ minutes: 30 }).toJSDate(),
    });
  });
});
