import { afterEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { Editor } from '@tiptap/core';
import type { WorkspaceId } from '@common/ids';
import { EventResponse, LinkState, Provider } from '@common/types';
import { FakeMain, workspace } from './fake-main';
import { fakeCalendar, fakeEvent, FakeCalendar } from './fake-calendar';
import { fakeNote, fakeTask, FakeTasks } from './fake-tasks';
import { byText, click, eventually, startApp, stopApps } from './harness';

// The calendar page (/app/$workspaceId/calendar) over a fake main's calendars and events: the
// URL drives the view and the range read, the filter writes each calendar's visibility, and the
// sheet at ?sheet= shows an event (or a task, or the event's note), edits it, and asks which
// occurrences for a series.

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
const noteSheet = () => document.querySelector<HTMLElement>('[data-testid="note-sheet"]');
const strip = () => document.querySelector<HTMLElement>('[data-testid="event-strip"]');
// whichever sheet is on screen, and its ×
const openSheet = () => document.querySelector<HTMLElement>('[data-sheet]');
const closeButton = () =>
  openSheet()?.querySelector<HTMLElement>('button[aria-label="Close"]') ?? null;
const pressEscape = (target: EventTarget = document.body) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
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
    expect(app.text()).toContain('June 2026');
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

  it('adds a history entry for another view or date, so Back returns to the one before', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-24` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(byText(app.container, 'button', 'Month'));
    await eventually(() => expect(page(app.container)?.dataset.view).toBe('month'));
    click(app.container.querySelector('[aria-label="Next month"]'));
    await eventually(() => expect(search(app).get('date')).toBe('2026-07-24'));
    click(byText(app.container, 'button', 'Day'));
    await eventually(() => expect(search(app).get('view')).toBe('day'));

    app.router.history.back();
    await eventually(() => expect(search(app).get('view')).toBe('month'));
    expect(search(app).get('date')).toBe('2026-07-24');
    // the step to July was an entry of its own
    app.router.history.back();
    await eventually(() => expect(search(app).get('date')).toBe('2026-06-24'));
    expect(search(app).get('view')).toBe('month');
    app.router.history.back();
    await eventually(() => expect(search(app).get('view')).toBeNull());
    expect(search(app).get('date')).toBe('2026-06-24');
    await eventually(() => expect(page(app.container)?.dataset.view).toBe('week'));
  });

  it('switches view and steps through the range in the URL, Today removing the date', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-24` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(byText(app.container, 'button', 'Month'));
    await eventually(() => expect(search(app).get('view')).toBe('month'));
    await eventually(() => expect(page(app.container)?.dataset.view).toBe('month'));
    click(app.container.querySelector('[aria-label="Next month"]'));
    await eventually(() => expect(search(app).get('date')).toBe('2026-07-24'));
    await eventually(() => expect(app.text()).toContain('July 2026'));
    click(byText(app.container, 'button', 'Today'));
    await eventually(() => expect(search(app).get('date')).toBeNull());
  });

  it('opens a one-off event in the sheet, and Back closes it', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(eventEl('Design Review')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
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
    // a drag in it selects text rather than swiping it away
    expect(sheet()!.hasAttribute('data-base-ui-swipe-ignore')).toBe(true);
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
    await eventually(() => expect(sheet()).toBeNull());
  });

  it('gives each item opened in the sheet a history entry, so Back returns to the one before', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(eventEl('Design Review')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    click(eventEl('Gym')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_gym'));
    // the item already shown adds no entry
    click(eventEl('Gym')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_gym'));

    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
  });

  it('closes with × or Esc as an entry of its own, whatever was opened before, and Back reopens it', async () => {
    for (const close of [() => click(closeButton()), () => pressEscape()]) {
      const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-22` });
      await eventually(() => expect(eventEl('Design Review')).toBeDefined());
      click(eventEl('Design Review')!);
      await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
      click(eventEl('Gym')!);
      await eventually(() => expect(search(app).get('sheet')).toBe('evt_gym'));
      await eventually(() => expect(closeButton()).not.toBeNull());
      const entries = app.router.history.length;
      close();
      // closed, not back at the event before
      await eventually(() => expect(search(app).get('sheet')).toBeNull());
      await eventually(() => expect(openSheet()).toBeNull());
      expect(app.router.history.length).toBe(entries + 1);
      app.router.history.back();
      await eventually(() => expect(search(app).get('sheet')).toBe('evt_gym'));
      app.router.history.back();
      await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
      app.router.history.back();
      await eventually(() => expect(search(app).get('sheet')).toBeNull());
      stopApps();
    }
  });

  it('closes a sheet opened from a link the same way', async () => {
    const app = startApp(mainWith(store()), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review`,
    });
    await eventually(() => expect(closeButton()).not.toBeNull());
    click(closeButton());
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
    expect(app.router.history.length).toBe(2);
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
  });

  it('keeps the sheet through another week or view, and closes it for good after', async () => {
    const app = startApp(mainWith(store()), { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(eventEl('Design Review')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    click(app.container.querySelector('[aria-label="Next week"]'));
    await eventually(() => expect(search(app).get('date')).toBe('2026-06-29'));
    expect(search(app).get('sheet')).toBe('evt_review');
    await eventually(() => expect(closeButton()).not.toBeNull());
    click(closeButton());
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
    expect(search(app).get('date')).toBe('2026-06-29');
    // Back undoes the close, then the week
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    expect(search(app).get('date')).toBe('2026-06-29');
  });

  it('opens a task’s linked event in the same sheet, keeping the view', async () => {
    const tasks = new FakeTasks([
      fakeTask('tsk_guide', 'Write PKCE migration guide', {
        dueDate: at(1, 0),
        linkedEventId: 'evt_review' as never,
      }),
    ]);
    const app = startApp(mainWith(store(), tasks), {
      url: `/app/${WORK}/calendar?date=2026-06-22&view=day&sheet=tsk_guide`,
    });
    const taskSheet = () => document.querySelector<HTMLElement>('[data-testid="task-sheet"]');
    await eventually(() => expect(byText(taskSheet()!, 'button', 'Design Review')).not.toBeNull());
    click(byText(taskSheet()!, 'button', 'Design Review'));
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    expect(search(app).get('view')).toBe('day');
  });

  it('ignores an id its sheet doesn’t show, and the params sheets had before', async () => {
    const app = startApp(mainWith(store()), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=prj_auth&open=evt_review`,
    });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    // the bad id leaves the URL; the older param is no param of the page's, so it is never read
    expect(search(app).get('sheet')).toBeNull();
    expect(openSheet()).toBeNull();
    click(eventEl('Gym')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_gym'));
    await eventually(() => expect(sheet()?.textContent).toContain('Delete event'));
  });

  it('opens an occurrence of a series with its start, and asks which events an edit changes', async () => {
    const main = mainWith(store());
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(events('Daily Standup')).toHaveLength(7));
    click(events('Daily Standup')[2]);
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_standup'));
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
      expect(search(app).get('sheet')).toBe(`evt_standup_${at(2, 9).getTime()}`),
    );
  });

  const descriptionOf = () =>
    sheet()?.querySelector<HTMLElement>('[role="textbox"][aria-label="Description"]');
  // a copy of the event each time, as IPC sends one: never the stored row
  function copyingReads(main: FakeMain, calendar: FakeCalendar) {
    main.routes.set('events.get', (args) => [structuredClone(calendar.find(args.id)), []]);
  }

  it('saves a one-off event’s description as it is typed, and leaves the editor alone', async () => {
    const calendar = store();
    const main = mainWith(calendar);
    copyingReads(main, calendar);
    startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review` });
    await eventually(() => expect(descriptionOf()).toBeTruthy());
    const editor = (descriptionOf() as unknown as { editor: Editor }).editor;

    const reads = main.callsTo('events.get').length;
    editor.chain().focus('end').insertContent('Bring the mocks').run();
    const document = editor.state.doc;
    window.dispatchEvent(new Event('blur'));
    await eventually(() => expect(main.callsTo('events.update')).toHaveLength(1));
    expect(main.callsTo('events.update')[0].input).toEqual({
      id: 'evt_review',
      description: 'Bring the mocks',
    });
    await eventually(() => expect(main.callsTo('events.get').length).toBeGreaterThan(reads));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.state.doc).toBe(document);

    // a change from outside is shown
    calendar.update('evt_review', { description: 'Rewritten elsewhere' });
    main.push('db.changes', { entities: ['event'] });
    await eventually(() => expect(editor.getMarkdown()).toBe('Rewritten elsewhere'));
  });

  it('saves a series’ description on leaving the editor, through the question of which events', async () => {
    const calendar = store();
    const main = mainWith(calendar);
    copyingReads(main, calendar);
    startApp(main, {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_standup&occurrence=${at(2, 9).toISOString()}`,
    });
    await eventually(() => expect(descriptionOf()).toBeTruthy());
    const element = descriptionOf()!;
    const editor = (element as unknown as { editor: Editor }).editor;

    editor.chain().focus('end').insertContent('What changed since yesterday').run();
    // not as it is typed: a pause and the window losing focus save nothing
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(main.callsTo('events.update')).toHaveLength(0);
    expect(document.querySelector('[data-testid="scope-dialog"]')).toBeNull();

    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const dialog = () => document.querySelector<HTMLElement>('[data-testid="scope-dialog"]');
    await eventually(() => expect(dialog()?.textContent).toContain('Change a recurring event'));
    click(byText(dialog()!, '[role="radio"], label, button', 'All events'));
    click(byText(dialog()!, 'button', 'Save'));
    await eventually(() =>
      expect(calendar.find('evt_standup')?.description).toBe('What changed since yesterday'),
    );
    const saved = editor.state.doc;
    await new Promise((resolve) => setTimeout(resolve, 50));
    // saved, it comes back as the text the editor holds: nothing is loaded
    expect(editor.state.doc).toBe(saved);
    expect(editor.getMarkdown()).toBe('What changed since yesterday');
  });

  it('deletes a one-off event after confirming, closing the sheet', async () => {
    const main = mainWith(store());
    const app = startApp(main, {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review`,
    });
    await eventually(() => expect(sheet()?.textContent).toContain('Delete event'));
    click(byText(sheet()!, 'button', 'Delete event'));
    await eventually(() => expect(document.body.textContent).toContain('Delete Design Review?'));
    click(byText(document.body, 'button', 'Delete Event'));
    await eventually(() => expect(main.callsTo('events.delete')).toHaveLength(1));
    expect(main.callsTo('events.delete')[0].input).toEqual({ id: 'evt_review' });
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
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
    startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_allhands` });
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

  it('shows the task sheet for ?sheet=tsk_…', async () => {
    const tasks = new FakeTasks([fakeTask('tsk_guide', 'Write PKCE migration guide')]);
    startApp(mainWith(store(), tasks), {
      url: `/app/${WORK}/calendar?sheet=tsk_guide`,
    });
    const taskSheet = () => document.querySelector('[data-testid="task-sheet"]');
    await eventually(() =>
      expect(taskSheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Write PKCE migration guide',
      ),
    );
  });

  it('draws a task on the day it is due, opens its sheet, and hides tasks for the workspace from the filter', async () => {
    const tasks = new FakeTasks([
      fakeTask('tsk_guide', 'Write PKCE migration guide', { dueDate: at(1, 0) }),
      fakeTask('tsk_later', 'Ship auth overhaul', { dueDate: at(9, 0) }),
      fakeTask('tsk_someday', 'Tidy the runbook'),
    ]);
    const main = mainWith(store(), tasks);
    const app = startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22` });
    await eventually(() => expect(eventEl('Write PKCE migration guide')).toBeDefined());
    // the week's tasks only: Monday 22 up to Monday 29
    expect(eventEl('Ship auth overhaul')).toBeUndefined();
    expect(eventEl('Tidy the runbook')).toBeUndefined();
    expect(
      main.callsTo('tasks.list').map((call) => (call.input as { filter: unknown }).filter),
    ).toContainEqual({ dueAfter: new Date(MONDAY.getTime() - 1), dueBefore: at(7, 0) });

    click(eventEl('Write PKCE migration guide')!);
    await eventually(() => expect(search(app).get('sheet')).toBe('tsk_guide'));
    await eventually(() =>
      expect(
        document.querySelector('[data-testid="task-sheet"] input[aria-label="Title"]'),
      ).toHaveProperty('value', 'Write PKCE migration guide'),
    );
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBeNull());

    click(byText(app.container, 'button', 'Filter'));
    const menu = () => document.querySelector<HTMLElement>('[data-testid="calendar-filter"]');
    await eventually(() => expect(menu()).not.toBeNull());
    click(byText(menu()!, '[role="menuitemcheckbox"]', 'Tasks'));
    await eventually(() =>
      expect(main.callsTo('workspace.setSetting').map((call) => call.input)).toEqual([
        { path: 'calendar.showTasks', value: false },
      ]),
    );
    await eventually(() => expect(eventEl('Write PKCE migration guide')).toBeUndefined());
    expect(eventEl('Design Review')).toBeDefined();
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

  it('opens the event’s note in the sheet from its card, under the meeting, and goes back to the event', async () => {
    const tasks = new FakeTasks(
      [],
      [],
      [fakeNote('nte_review', 'Design Review notes', { linkedEventId: 'evt_review' as never })],
    );
    tasks.contents.set('nte_review', 'Decided: ship the revamp.');
    const app = startApp(mainWith(store(), tasks), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review`,
    });
    const note = () => document.querySelector<HTMLElement>('[data-testid="event-note"]');
    await eventually(() => expect(note()?.textContent).toContain('Design Review notes'));
    click(byText(note()!, '[role="button"], button', 'Design Review notes'));
    // the note is the sheet's item, as an entry of its own
    await eventually(() => expect(search(app).get('sheet')).toBe('nte_review'));
    await eventually(() => expect(noteSheet()?.textContent).toContain('Decided: ship the revamp.'));
    expect(sheet()).toBeNull();
    // the meeting, over the note
    await eventually(() => expect(strip()?.textContent).toContain('Design Review'));
    expect(strip()!.textContent).toContain('Room 4B');
    expect(byText(strip()!, 'button', 'Join')).not.toBeNull();
    expect(noteSheet()!.querySelector('input[aria-label="Title"]')).toHaveProperty(
      'value',
      'Design Review notes',
    );
    expect(noteSheet()!.textContent).toContain('Notes save as you type');
    click(byText(noteSheet()!, 'button', 'Event'));
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_review'));
    await eventually(() => expect(sheet()?.textContent).toContain('Delete event'));
    // each step was an entry: Back is the note again
    app.router.history.back();
    await eventually(() => expect(search(app).get('sheet')).toBe('nte_review'));
  });

  it('closes the whole sheet from the event’s note, however the event was opened', async () => {
    const tasks = () =>
      new FakeTasks(
        [],
        [],
        [fakeNote('nte_review', 'Design Review notes', { linkedEventId: 'evt_review' as never })],
      );
    // the event clicked in the grid, then its note
    const app = startApp(mainWith(store(), tasks()), {
      url: `/app/${WORK}/calendar?date=2026-06-22`,
    });
    await eventually(() => expect(eventEl('Design Review')).toBeDefined());
    click(eventEl('Design Review')!);
    const note = () => document.querySelector<HTMLElement>('[data-testid="event-note"]');
    await eventually(() => expect(note()?.textContent).toContain('Design Review notes'));
    click(byText(note()!, '[role="button"], button', 'Design Review notes'));
    await eventually(() => expect(noteSheet()).not.toBeNull());
    click(closeButton());
    await eventually(() => expect(search(app).get('sheet')).toBeNull());
    await eventually(() => expect(openSheet()).toBeNull());
    stopApps();

    // the note opened from a link
    const linked = startApp(mainWith(store(), tasks()), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=nte_review`,
    });
    await eventually(() => expect(noteSheet()).not.toBeNull());
    click(closeButton());
    await eventually(() => expect(search(linked).get('sheet')).toBeNull());
    await eventually(() => expect(openSheet()).toBeNull());
  });

  it('names the occurrence the note was opened from in its strip, and how a series repeats without one', async () => {
    const tasks = () =>
      new FakeTasks(
        [],
        [],
        [fakeNote('nte_standup', 'Standup notes', { linkedEventId: 'evt_standup' as never })],
      );
    const occurrence = at(2, 9).toISOString();
    const app = startApp(mainWith(store(), tasks()), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_standup&occurrence=${occurrence}`,
    });
    const note = () => document.querySelector<HTMLElement>('[data-testid="event-note"]');
    await eventually(() => expect(note()?.textContent).toContain('Standup notes'));
    click(byText(note()!, '[role="button"], button', 'Standup notes'));
    await eventually(() => expect(search(app).get('sheet')).toBe('nte_standup'));
    // the occurrence goes with the note, and comes back with "‹ Event"
    expect(search(app).get('occurrence')).toBe(occurrence);
    await eventually(() => expect(strip()?.textContent).toContain('Daily Standup'));
    expect(strip()!.textContent).not.toContain('Every day');
    click(byText(noteSheet()!, 'button', 'Event'));
    await eventually(() => expect(search(app).get('sheet')).toBe('evt_standup'));
    expect(search(app).get('occurrence')).toBe(occurrence);
    stopApps();

    // from a link there is no occurrence: the strip says when the series repeats
    startApp(mainWith(store(), tasks()), {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=nte_standup`,
    });
    await eventually(() => expect(strip()?.textContent).toContain('Every day'));
  });

  it('starts the event’s note from "Add a note", in the sheet with the caret in its body', async () => {
    const main = mainWith(store());
    const app = startApp(main, {
      url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review`,
    });
    const note = () => document.querySelector<HTMLElement>('[data-testid="event-note"]');
    await eventually(() => expect(byText(note()!, 'button', 'Add a note')).not.toBeNull());
    click(byText(note()!, 'button', 'Add a note'));
    await eventually(() => expect(main.callsTo('notes.create')).toHaveLength(1));
    expect(main.callsTo('notes.create')[0].input).toEqual({
      title: 'Design Review notes',
      linkedEventId: 'evt_review',
    });
    // the note opens in the sheet, not on its own page
    await eventually(() => expect(search(app).get('sheet')).toMatch(/^nte_/));
    expect(app.path()).toContain('/calendar?');
    await eventually(() =>
      expect(noteSheet()?.querySelector('input[aria-label="Title"]')).toHaveProperty(
        'value',
        'Design Review notes',
      ),
    );
    await eventually(() =>
      expect(document.activeElement?.closest('[role="textbox"][aria-label="Note"]')).not.toBeNull(),
    );
  });

  it('links an existing note as the event’s from the section’s Link', async () => {
    const tasks = new FakeTasks([], [], [fakeNote('nte_loose', 'Loose notes')]);
    const main = mainWith(store(), tasks);
    startApp(main, { url: `/app/${WORK}/calendar?date=2026-06-22&sheet=evt_review` });
    const note = () => document.querySelector<HTMLElement>('[data-testid="event-note"]');
    await eventually(() => expect(byText(note()!, 'button', 'Link')).not.toBeNull());
    click(byText(note()!, 'button', 'Link'));
    await eventually(() =>
      expect(byText(document.body, '[role="menuitem"]', 'Loose notes')).not.toBeNull(),
    );
    click(byText(document.body, '[role="menuitem"]', 'Loose notes'));
    await eventually(() => expect(note()?.textContent).toContain('Loose notes'));
    expect(byText(note()!, 'button', 'Add a note')).toBeNull();
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
