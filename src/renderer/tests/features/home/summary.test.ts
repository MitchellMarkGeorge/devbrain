import { describe, expect, it } from 'vitest';
import type { IntegrationId } from '@common/ids';
import {
  AuthType,
  EventKind,
  EventResponse,
  IntegrationStatus,
  ProjectStatus,
  Provider,
  type Integration,
  type Note,
} from '@common/types';
import { createFormat } from '@renderer/components';
import {
  greetingAt,
  meetingsOf,
  pausedIntegration,
  setupSteps,
  summarizeHome,
  summaryText,
  type HomeData,
} from '@renderer/features/home/lib/summary';
import { event, id } from '../../fixtures/calendar';
import { fakeNote, fakeProject, fakeTask } from '../../routing/fake-tasks';

// Home's summary and section over fixed `now`s: Tuesday 10 Nov 2026, local time.

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const NOW = at(10, 9, 48);

const meeting = (name: string, start: Date, minutes = 30, extra = {}) =>
  event({
    id: id(`evt_${name.toLowerCase().replace(/\W+/g, '_')}`),
    title: name,
    startAt: start,
    endAt: new Date(start.getTime() + minutes * 60_000),
    ...extra,
  });

const task = (name: string, dueDate: Date | null, extra = {}) =>
  fakeTask(`tsk_${name.toLowerCase().replace(/\W+/g, '_')}`, name, { dueDate, ...extra });

const note = (name: string): Note => fakeNote(`nte_${name.toLowerCase()}`, name);

const integration = (provider: Provider, status = IntegrationStatus.CONNECTED): Integration => ({
  id: `int_${provider}` as IntegrationId,
  provider,
  authType: AuthType.OAUTH,
  accountLabel: 'me@example.com',
  status,
  sources: [],
  createdAt: NOW,
  updatedAt: NOW,
});

function data(fields: Partial<HomeData> = {}): HomeData {
  return {
    now: NOW,
    events: [],
    dueTasks: [],
    hasTasks: true,
    dueProjects: [],
    recentProjects: [],
    recentNotes: [],
    integrations: [integration(Provider.GOOGLE_CALENDAR)],
    ...fields,
  };
}

function home(fields: Partial<HomeData> = {}) {
  const input = data(fields);
  const result = summarizeHome(input, createFormat(input.now), 'Acme');
  return { ...result, text: summaryText(result.summary) };
}

const SPRINT = meeting('Sprint Planning', at(10, 10, 0), 60, {
  meetingUrl: 'https://meet.example/a',
});
const ONE_ON_ONE = meeting('Mitchell / Jesse 1:1', at(10, 10, 30));
const REVIEW = meeting('Design Review', at(10, 13, 0));
const RETRO = meeting('Retrospective', at(10, 16, 0));
const STANDUP_TOMORROW = meeting('Daily Standup', at(11, 9, 30));

const OVERDUE = [
  task('Refactor token refresh logic', at(6, 0)),
  task('Audit token storage', at(7, 0)),
];
const TODAY = [
  task('Implement OAuth2 PKCE flow', at(10, 0)),
  task('Write rollout plan', at(10, 0)),
  task('Review PR', at(10, 0)),
  task('Update docs', at(10, 0)),
];

describe('greetingAt', () => {
  it('greets by the time of day, without a name', () => {
    expect(greetingAt(at(10, 5))).toBe('Good morning');
    expect(greetingAt(at(10, 11, 59))).toBe('Good morning');
    expect(greetingAt(at(10, 12))).toBe('Good afternoon');
    expect(greetingAt(at(10, 17, 59))).toBe('Good afternoon');
    expect(greetingAt(at(10, 18))).toBe('Good evening');
    expect(greetingAt(at(10, 2))).toBe('Good evening');
  });
});

describe('meetingsOf', () => {
  it("expands a series into today's and tomorrow's occurrences, in order", () => {
    const daily = meeting('Standup', at(2, 9, 0), 15, { recurrenceRule: 'RRULE:FREQ=DAILY' });
    const meetings = meetingsOf([REVIEW, daily], NOW);
    expect(meetings.map((m) => [m.event.title, m.start])).toEqual([
      ['Standup', at(10, 9)],
      ['Design Review', at(10, 13)],
      ['Standup', at(11, 9)],
    ]);
    expect(new Set(meetings.map((m) => m.key)).size).toBe(3);
  });

  it('leaves out an excluded occurrence', () => {
    const daily = meeting('Standup', at(2, 9, 0), 15, {
      recurrenceRule: 'RRULE:FREQ=DAILY',
      exdates: [at(10, 9)],
    });
    expect(meetingsOf([daily], NOW).map((m) => m.start)).toEqual([at(11, 9)]);
  });

  it('leaves out all-day events, out of office, focus time and declined invitations', () => {
    const allDay = meeting('Offsite', at(10, 0), 24 * 60, {
      allDay: true,
      startDate: '2026-11-10',
      endDate: '2026-11-11',
    });
    const away = meeting('Away', at(10, 14), 60, { kind: EventKind.OUT_OF_OFFICE });
    const focus = meeting('Focus', at(10, 15), 60, { kind: EventKind.FOCUS_TIME });
    const declined = meeting('Declined', at(10, 16), 60, { response: EventResponse.DECLINED });
    expect(
      meetingsOf([allDay, away, focus, declined, REVIEW], NOW).map((m) => m.event.title),
    ).toEqual(['Design Review']);
  });
});

describe('summarizeHome', () => {
  it('Home (7254:8102): a meeting in 12 minutes is now, and wins over overdue tasks', () => {
    const result = home({
      events: [SPRINT, ONE_ON_ONE, REVIEW, RETRO],
      dueTasks: [...OVERDUE, ...TODAY],
    });
    expect(result.greeting).toBe('Good morning');
    expect(result.isNew).toBe(false);
    expect(result.text).toBe(
      'Sprint Planning starts in 12 minutes. You have 6 tasks today, and 2 are overdue.',
    );
    expect(result.summary).toContainEqual({ text: 'Sprint Planning', tone: 'strong' });
    expect(result.summary).toContainEqual({ text: '6 tasks', tone: 'strong' });
    expect(result.summary).toContainEqual({ text: '2 are overdue', tone: 'overdue' });
    expect(result.section?.kind).toBe('meetings');
    if (result.section?.kind !== 'meetings') return;
    expect(result.section.rows.map((r) => [r.meeting.event.title, r.current])).toEqual([
      ['Sprint Planning', true],
      ['Mitchell / Jesse 1:1', false],
      ['Design Review', false],
    ]);
    expect(result.section.more).toBe(1);
  });

  it('shows Join from 5 minutes before the start until the end, with a meeting link', () => {
    const joinable = (now: Date) => {
      const result = home({ now, events: [SPRINT] });
      return result.section?.kind === 'meetings' && result.section.rows[0].joinable;
    };
    expect(joinable(at(10, 9, 54))).toBe(false);
    expect(joinable(at(10, 9, 55))).toBe(true);
    expect(joinable(at(10, 10, 59))).toBe(true);
    expect(home({ events: [ONE_ON_ONE], now: at(10, 10, 30) }).section).toMatchObject({
      rows: [{ joinable: false }],
    });
  });

  it('drops finished meetings, says a running one is on now, and dims tomorrow’s first', () => {
    const result = home({ now: at(10, 10, 40), events: [SPRINT, ONE_ON_ONE, STANDUP_TOMORROW] });
    expect(result.text).toBe('Nothing’s due today. Sprint Planning is on now.');
    expect(result.section).toMatchObject({
      kind: 'meetings',
      rows: [
        { meeting: { event: { title: 'Sprint Planning' } }, current: true, muted: false },
        { meeting: { event: { title: 'Mitchell / Jesse 1:1' } }, current: false },
        { meeting: { event: { title: 'Daily Standup' } }, muted: true },
      ],
      more: 0,
    });
    const later = home({ now: at(10, 11, 30), events: [SPRINT, ONE_ON_ONE] });
    expect(later.section?.kind).not.toBe('meetings');
  });

  it('All caught up (7257:8792): nothing due, a meeting soon', () => {
    const result = home({ events: [SPRINT, REVIEW] });
    expect(result.text).toBe('Nothing’s due today. Sprint Planning starts in 12 minutes.');
    expect(result.summary[0]).toEqual({ text: 'Nothing’s due today', tone: 'onTrack' });
    expect(result.section?.kind).toBe('meetings');
  });

  it('Free day (7261:11556): nothing due and no meetings; recent notes', () => {
    const notes = [note('PKCE'), note('Sprint'), note('ADR'), note('Older')];
    const result = home({ events: [STANDUP_TOMORROW], recentNotes: notes });
    expect(result.text).toBe(
      'Your day is clear: nothing due and no meetings. Your next meeting is tomorrow at 9:30 AM.',
    );
    expect(result.summary[0]).toEqual({ text: 'Your day is clear', tone: 'onTrack' });
    expect(result.section).toEqual({ kind: 'notes', rows: notes.slice(0, 3) });
  });

  it('says "no more meetings" once today’s are over', () => {
    const result = home({ now: at(10, 17), events: [SPRINT] });
    expect(result.text).toBe('Your day is clear: nothing due and no more meetings.');
  });

  it('No events (7259:11058): today’s tasks', () => {
    const result = home({ dueTasks: [...OVERDUE, ...TODAY] });
    expect(result.text).toBe(
      'You have 6 tasks today, and 2 are overdue. There are no meetings today.',
    );
    expect(result.section).toMatchObject({ kind: 'tasks', total: 6, more: 3 });
    if (result.section?.kind !== 'tasks') return;
    expect(result.section.rows.map((t) => t.title)).toEqual([
      'Refactor token refresh logic',
      'Audit token storage',
      'Implement OAuth2 PKCE flow',
    ]);
  });

  it('words one task and all-overdue tasks', () => {
    expect(home({ dueTasks: [TODAY[0]] }).text).toBe(
      'You have 1 task today. There are no meetings today.',
    );
    expect(home({ dueTasks: [OVERDUE[0]] }).text).toBe(
      'You have 1 task today, and it is overdue. There are no meetings today.',
    );
    expect(home({ dueTasks: OVERDUE }).text).toBe(
      'You have 2 tasks today, and all are overdue. There are no meetings today.',
    );
  });

  it('chooses tasks over a meeting more than an hour away, and says when it starts', () => {
    const result = home({ events: [REVIEW], dueTasks: TODAY });
    expect(result.text).toBe('Design Review starts at 1:00 PM. You have 4 tasks today.');
    expect(result.section?.kind).toBe('tasks');
  });

  it('chooses the meeting once it is within the hour, on a tie with tasks', () => {
    expect(home({ now: at(10, 12, 0), events: [REVIEW], dueTasks: TODAY }).section?.kind).toBe(
      'meetings',
    );
    expect(home({ now: at(10, 11, 59), events: [REVIEW], dueTasks: TODAY }).section?.kind).toBe(
      'tasks',
    );
  });

  it('No tasks yet (7257:9513): a meeting soon, no tasks at all', () => {
    const result = home({ hasTasks: false, events: [SPRINT] });
    expect(result.text).toBe(
      'Sprint Planning starts in 12 minutes. You don’t have any tasks yet; add one in the box above.',
    );
    expect(result.section?.kind).toBe('meetings');
  });

  it('No tasks or events (7262:12053): recent projects', () => {
    const projects = [
      fakeProject('prj_auth', 'Auth Overhaul', { status: ProjectStatus.NOT_STARTED }),
      fakeProject('prj_done', 'Shipped', { status: ProjectStatus.COMPLETED }),
    ];
    const result = home({ hasTasks: false, recentProjects: projects, integrations: [] });
    expect(result.text).toBe(
      'Nothing on today yet. Add a task above, or connect your calendar and Linear to bring in your work.',
    );
    // only what isn't connected yet
    expect(home({ hasTasks: false, recentProjects: projects }).text).toBe(
      'Nothing on today yet. Add a task above, or connect Linear to bring in your work.',
    );
    expect(result.section).toEqual({ kind: 'projects', rows: [projects[0]], due: false });
  });

  it('prefers recent notes to recent projects when nothing is coming up', () => {
    const result = home({
      recentNotes: [note('PKCE')],
      recentProjects: [fakeProject('prj_auth', 'Auth Overhaul')],
    });
    expect(result.section?.kind).toBe('notes');
  });

  it('chooses a project coming due over a note, and over a meeting later than its day', () => {
    const project = fakeProject('prj_gw', 'API Gateway v2', { dueDate: at(12, 0) });
    const withNote = home({ dueProjects: [project], recentNotes: [note('PKCE')] });
    expect(withNote.section).toEqual({ kind: 'projects', rows: [project], due: true });
    expect(withNote.text).toBe(
      'API Gateway v2 is due in 2 days. Your day is clear: nothing due and no meetings.',
    );
    // a meeting today comes before a project due on Thursday
    expect(home({ dueProjects: [project], events: [RETRO] }).section?.kind).toBe('meetings');
  });

  it('puts tasks before a project due today, and a project due today before a later meeting', () => {
    const today = fakeProject('prj_today', 'Launch', { dueDate: at(10, 0) });
    expect(home({ dueProjects: [today], dueTasks: TODAY }).section?.kind).toBe('tasks');
    const result = home({ dueProjects: [today], events: [RETRO] });
    expect(result.section?.kind).toBe('projects');
    expect(result.text).toBe(
      'Launch is due today. Nothing’s due today. Retrospective starts at 4:00 PM.',
    );
  });

  it('says an overdue project is overdue, and ignores completed and far-off projects', () => {
    const late = fakeProject('prj_late', 'Late', { dueDate: at(3, 0) });
    expect(home({ dueProjects: [late] }).text).toMatch(/^Late is overdue\./);
    const done = fakeProject('prj_done', 'Done', {
      dueDate: at(11, 0),
      status: ProjectStatus.COMPLETED,
    });
    const far = fakeProject('prj_far', 'Far', { dueDate: at(17, 0) });
    expect(home({ dueProjects: [done, far] }).section).toEqual({
      kind: 'getStarted',
      steps: ['linear'],
    });
  });

  it('First run (7257:10066): a new workspace greets by its name and offers Get started', () => {
    const result = home({ hasTasks: false, integrations: [] });
    expect(result.isNew).toBe(true);
    expect(result.greeting).toBe('Welcome to Acme');
    expect(result.text).toBe(
      'This is your Home. As you add tasks, notes and meetings, the ones that matter most right now show up here.',
    );
    expect(result.section).toEqual({
      kind: 'getStarted',
      steps: ['calendar', 'linear', 'project'],
    });
  });

  it('keeps offering the steps not done, and nothing once every one is', () => {
    const calendar = integration(Provider.GOOGLE_CALENDAR);
    const linear = integration(Provider.LINEAR);
    expect(home({ hasTasks: false, integrations: [calendar] })).toMatchObject({
      isNew: false,
      greeting: 'Good morning',
      section: { kind: 'getStarted', steps: ['linear', 'project'] },
    });
    const project = fakeProject('prj_done', 'Done', { status: ProjectStatus.COMPLETED });
    expect(
      home({ integrations: [calendar, linear], recentProjects: [project] }).section,
    ).toBeNull();
    expect(home({ hasTasks: false, integrations: [calendar, linear] }).text).toBe(
      'Nothing on today yet. Add a task above.',
    );
  });

  it('is no longer new once anything is in it', () => {
    const empty = { hasTasks: false, integrations: [] };
    expect(home({ ...empty }).isNew).toBe(true);
    expect(home({ ...empty, hasTasks: true }).isNew).toBe(false);
    expect(home({ ...empty, recentNotes: [note('A')] }).isNew).toBe(false);
    expect(home({ ...empty, events: [STANDUP_TOMORROW] }).isNew).toBe(false);
    expect(home({ ...empty, recentProjects: [fakeProject('prj_a', 'A')] }).isNew).toBe(false);
  });

  it('counts down as `now` moves, with no new data', () => {
    const input = { events: [SPRINT], recentNotes: [note('PKCE')] };
    expect(home({ ...input, now: at(10, 9, 59) }).text).toBe(
      'Nothing’s due today. Sprint Planning starts in 1 minute.',
    );
    expect(home({ ...input, now: at(10, 10) }).text).toBe(
      'Nothing’s due today. Sprint Planning is on now.',
    );
    expect(home({ ...input, now: at(10, 11) }).section?.kind).toBe('notes');
  });
});

describe('setupSteps and pausedIntegration', () => {
  it('offers what is not connected or made yet', () => {
    expect(setupSteps({ integrations: [], recentProjects: [] })).toEqual([
      'calendar',
      'linear',
      'project',
    ]);
    expect(
      setupSteps({
        integrations: [integration(Provider.LINEAR)],
        recentProjects: [fakeProject('prj_a', 'A')],
      }),
    ).toEqual(['calendar']);
  });

  it('finds the integration that needs signing in again', () => {
    const paused = integration(Provider.GOOGLE_CALENDAR, IntegrationStatus.NEEDS_REAUTH);
    expect(pausedIntegration([integration(Provider.LINEAR), paused])).toBe(paused);
    expect(pausedIntegration([integration(Provider.LINEAR)])).toBeUndefined();
  });
});
