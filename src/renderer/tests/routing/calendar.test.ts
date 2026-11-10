// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { WorkspaceId } from '@common/ids';
import { EventResponse, LinkState, Provider } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeCalendar, fakeEvent, FakeCalendar } from './fake-calendar';
import { fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The calendar page (/app/$workspaceId/calendar) over a fake main's calendars and events: the
// URL drives the view and the range read, the filter writes each calendar's visibility, and the
// sheet at ?open= shows an event (or a task), edits it, and asks which occurrences for a series.

const WORK = 'wsp_work' as WorkspaceId;

afterEach(() => stopApps());

// Monday 22 June 2026: a week of its own from Monday
const MONDAY = new Date(2026, 5, 22);
const at = (days: number, hour: number) =>
  DateTime.fromJSDate(MONDAY).plus({ days, hours: hour }).toJSDate();

function mainWith(calendar: FakeCalendar, tasks = new FakeTasks()) {
  const main = new FakeMain([workspace(WORK, 'Work')], WORK);
  main.calendarStores.set(WORK, calendar);
  main.taskStores.set(WORK, tasks);
  return main;
}

function store() {
  return new FakeCalendar(
    [
      fakeCalendar('cal_work', 'Work', { isPrimary: true }),
      fakeCalendar('cal_home', 'Personal', { color: '#f59e0b' }),
    ],
    [
      fakeEvent('evt_review', 'Design Review', at(0, 13), {
        location: 'Room 4B',
        meetingUrl: 'https://meet.example.com/review',
      }),
      fakeEvent('evt_standup', 'Daily Standup', at(0, 9), {
        recurrenceRule: 'RRULE:FREQ=DAILY',
      }),
      fakeEvent('evt_gym', 'Gym', at(1, 18), { calendarId: 'cal_home' as never }),
    ],
  );
}

const page = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-testid="calendar-page"]');
const sheet = () => document.querySelector<HTMLElement>('[data-testid="event-sheet"]');
// FullCalendar draws each event as a button in its day's list
const events = (title: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="calendar-page"] [role="listitem"] > [role="button"]',
    ),
  ].filter((el) => el.textContent?.includes(title));
const eventEl = (title: string): HTMLElement | undefined => events(title)[0];
const search = (app: { path(): string }) => new URL(app.path(), 'http://x').searchParams;

describe('the calendar page', () => {
  it('draws the week the URL names, reading each visible calendar for that range', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-24` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    expect(page(app.container)?.dataset.view).toBe('week');
    // a compact window: the short month
    expect(app.text()).toContain('Jun 2026');
    expect(eventEl('Gym')).toBeDefined();
    const reads = main.callsTo('events.listForCalendar').map((call) => call.input as never);
    // the week Monday 22 to Monday 29, per calendar
    expect(reads).toContainEqual({
      start: MONDAY,
      end: at(7, 0),
      calendarIds: ['cal_work'],
    });
    expect(reads).toContainEqual({ start: MONDAY, end: at(7, 0), calendarIds: ['cal_home'] });
    // and the weeks either side, so ‹ and › draw at once
    expect(reads).toContainEqual({ start: at(-7, 0), end: MONDAY, calendarIds: ['cal_work'] });
    expect(reads).toContainEqual({ start: at(7, 0), end: at(14, 0), calendarIds: ['cal_work'] });
  });

  it('switches view and steps through the range in the URL, Today removing the date', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-24` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(byText(app.container, 'button', 'Month'));
    await eventually(() => expect(search(app).get('view')).toBe('month'));
    await eventually(() => expect(page(app.container)?.dataset.view).toBe('month'));
    click(app.container.querySelector('[aria-label="Next month"]'));
    await eventually(() => expect(search(app).get('date')).toBe('2026-07-24'));
    await eventually(() => expect(app.text()).toContain('Jul 2026'));
    click(byText(app.container, 'button', 'Today'));
    await eventually(() => expect(search(app).get('date')).toBeNull());
  });

  it('opens a one-off event in the sheet, and Back closes it', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(eventEl('Design Review')!);
    await eventually(() => expect(search(app).get('open')).toBe('evt_review'));
    expect(search(app).get('occurrence')).toBeNull();
    await eventually(() =>
      expect(sheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Design Review',
      ),
    );
    expect(sheet()?.querySelector('input[aria-label="Location"]')).toHaveProperty(
      'value',
      'Room 4B',
    );
    app.router.history.back();
    await eventually(() => expect(search(app).get('open')).toBeNull());
    await eventually(() => expect(sheet()).toBeNull());
  });

  it('opens an occurrence of a series with its start, and asks which events an edit changes', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(events('Daily Standup')).toHaveLength(7));
    click(events('Daily Standup')[2]);
    await eventually(() => expect(search(app).get('open')).toBe('evt_standup'));
    expect(new Date(search(app).get('occurrence')!)).toEqual(at(2, 9));

    const locationInput = () =>
      sheet()?.querySelector<HTMLInputElement>('input[aria-label="Location"]');
    await eventually(() => expect(locationInput()).toBeTruthy());
    const location = locationInput()!;
    location.focus();
    setInput(location, 'Room 2A');
    location.blur();

    const dialog = () => document.querySelector<HTMLElement>('[data-testid="scope-dialog"]');
    await eventually(() => expect(dialog()?.textContent).toContain('Change a recurring event'));
    expect(dialog()!.textContent).toContain('This event');
    expect(dialog()!.textContent).toContain('This and following events');
    expect(dialog()!.textContent).toContain('All events');
    click(byText(dialog()!, 'button', 'Save'));
    await eventually(() => expect(main.callsTo('events.updateOccurrence')).toHaveLength(1));
    expect(main.callsTo('events.updateOccurrence')[0].input).toEqual({
      seriesId: 'evt_standup',
      originalStartAt: at(2, 9),
      scope: 'this',
      location: 'Room 2A',
    });
    // the sheet moves to the occurrence's own row
    await eventually(() =>
      expect(search(app).get('open')).toBe(`evt_standup_${at(2, 9).getTime()}`),
    );
  });

  it('deletes a one-off event after confirming, closing the sheet', async () => {
    const main = mainWith(store());
    const app = startApp(main, {
      url: `/app/${WORK}/calendar?date=2026-06-22&open=evt_review`,
    });
    await eventually(() => expect(sheet()?.textContent).toContain('Delete event'));
    click(byText(sheet()!, 'button', 'Delete event'));
    await eventually(() => expect(document.body.textContent).toContain('Delete Design Review?'));
    click(byText(document.body, 'button', 'Delete Event'));
    await eventually(() => expect(main.callsTo('events.delete')).toHaveLength(1));
    expect(main.callsTo('events.delete')[0].input).toEqual({ id: 'evt_review' });
    await eventually(() => expect(search(app).get('open')).toBeNull());
    await eventually(() => expect(eventEl('Design Review')).toBeUndefined());
  });

  it('shows a Google event read-only, with the response', async () => {
    const calendar = store();
    calendar.calendars.push(
      fakeCalendar('cal_eng', 'Engineering', { sourceId: 'src_google' as never }),
    );
    calendar.events.push(
      fakeEvent('evt_allhands', 'Engineering All-hands', at(4, 11), {
        calendarId: 'cal_eng' as never,
        response: EventResponse.ACCEPTED,
        external: {
          provider: Provider.GOOGLE_CALENDAR,
          state: LinkState.SYNCED,
          key: null,
          url: 'https://calendar.google.com/event?eid=1',
          statusLabel: null,
          priorityLabel: null,
          lastSyncedAt: new Date(),
        },
      }),
    );
    const main = mainWith(calendar);
    startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22&open=evt_allhands` });
    await eventually(() => expect(sheet()?.textContent).toContain('Engineering All-hands'));
    expect(sheet()!.textContent).toContain('Google Calendar · Engineering');
    expect(sheet()!.textContent).toContain('Going');
    expect(sheet()!.querySelector('input[aria-label="Title"]')).toBeNull();
    expect(sheet()!.textContent).not.toContain('Delete event');
    click(byText(sheet()!, 'button', 'Open in Google Calendar'));
    await eventually(() =>
      expect(main.callsTo('workspace.openUrl').map((call) => call.input)).toEqual([
        { url: 'https://calendar.google.com/event?eid=1' },
      ]),
    );
  });

  it('shows the task sheet for ?open=tsk_…', async () => {
    const tasks = new FakeTasks([fakeTask('tsk_guide', 'Write PKCE migration guide')]);
    startApp(mainWith(store(), tasks), {
      url: `/app/${WORK}/calendar?open=tsk_guide`,
    });
    const taskSheet = () => document.querySelector('[data-testid="task-sheet"]');
    await eventually(() =>
      expect(taskSheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Write PKCE migration guide',
      ),
    );
  });

  it('hides a calendar from the filter, through core', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Gym')).toBeDefined());
    click(byText(app.container, 'button', 'Filter'));
    const menu = () => document.querySelector<HTMLElement>('[data-testid="calendar-filter"]');
    await eventually(() => expect(menu()?.textContent).toContain('Personal'));
    expect(menu()!.textContent).toContain('On this Mac');
    click(byText(menu()!, '[role="menuitemcheckbox"]', 'Personal'));
    await eventually(() =>
      expect(main.callsTo('calendars.setVisible').map((call) => call.input)).toEqual([
        { id: 'cal_home', visible: false },
      ]),
    );
    await eventually(() => expect(eventEl('Gym')).toBeUndefined());
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
  });

  it('creates an event from New Event', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-24` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(byText(app.container, 'button', 'New Event'));
    const dialog = () => document.querySelector<HTMLElement>('[data-testid="create-event"]');
    await eventually(() => expect(dialog()).not.toBeNull());
    setInput(dialog()!.querySelector('input[aria-label="Title"]')!, 'PKCE rollout sync');
    click(byText(dialog()!, 'button', 'Create Event'));
    await eventually(() => expect(main.callsTo('events.create')).toHaveLength(1));
    // Wednesday 9:00, for the setting's 30 minutes, on the first local calendar
    expect(main.callsTo('events.create')[0].input).toEqual({
      title: 'PKCE rollout sync',
      startAt: at(2, 9),
      endAt: DateTime.fromJSDate(at(2, 9)).plus({ minutes: 30 }).toJSDate(),
      allDay: false,
      calendarId: 'cal_work',
    });
    await eventually(() => expect(eventEl('PKCE rollout sync')).toBeDefined());
  });
});

// types into an input as React sees it
function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
