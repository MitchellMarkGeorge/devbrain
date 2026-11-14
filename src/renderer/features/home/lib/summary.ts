import { DateTime } from 'luxon';
import { occurrencesBetween } from '@common/recurrence';
import {
  EventKind,
  EventResponse,
  IntegrationStatus,
  ProjectStatus,
  Provider,
  type Event,
  type Integration,
  type Note,
  type Project,
  type TaskListItem,
} from '@common/types';

// What Home shows (docs/design-system/README.md, "Home"): the greeting, the summary sentence and
// the one section, chosen from what is coming up soonest. A pure function of the cached reads and
// `now`, so the page recomputes it each minute without a fetch.

const MINUTE = 60_000;
/** A meeting this close to its start counts as now when the section is chosen. */
const SOON = 60 * MINUTE;
/** The Join button shows from this long before a meeting until its end. */
const JOIN_BEFORE = 5 * MINUTE;
/** A section shows at most this many rows. */
export const SECTION_ROWS = 3;
/** Projects due within this many days (today included) can be Home's section. */
export const PROJECT_DAYS = 7;

/** One occurrence of a meeting: a one-off event, or a series' occurrence. */
export interface Meeting {
  event: Event;
  start: Date;
  end: Date;
  /** unique among the meetings: the event's id and the occurrence's start */
  key: string;
}

export interface MeetingRow {
  meeting: Meeting;
  /** the next or running meeting: the row is filled and counts down */
  current: boolean;
  /** from 5 minutes before the start until the end, with a meeting link: the Join button */
  joinable: boolean;
  /** tomorrow's first meeting, under today's: dimmed */
  muted: boolean;
}

export type SetupStep = 'calendar' | 'linear' | 'project';

/** Home's one section, with the rows it draws; null for none. */
export type HomeSectionChoice =
  | { kind: 'meetings'; rows: MeetingRow[]; /** today's meetings left out */ more: number }
  | { kind: 'tasks'; rows: TaskListItem[]; total: number; more: number }
  | {
      kind: 'projects';
      rows: Project[];
      /** projects coming due, else the recently changed */ due: boolean;
    }
  | { kind: 'notes'; rows: Note[] }
  | { kind: 'getStarted'; steps: SetupStep[] }
  | null;

/** How a part of the summary stands out: counts and names, overdue, and good news. */
export type SummaryTone = 'strong' | 'overdue' | 'onTrack';
export type SummaryPart = string | { text: string; tone: SummaryTone };

/** What Home is computed from: the page's reads, as core returns them. */
export interface HomeData {
  now: Date;
  /** `events.listForCalendar` from the start of today to the end of tomorrow */
  events: readonly Event[];
  /** open tasks due before tomorrow (overdue ones included), soonest first */
  dueTasks: readonly TaskListItem[];
  /** the workspace has a task at all, open or closed */
  hasTasks: boolean;
  /** projects due before the end of the 7th day, soonest first */
  dueProjects: readonly Project[];
  /** the workspace's projects, most recently changed first */
  recentProjects: readonly Project[];
  /** the notes opened last, most recent first */
  recentNotes: readonly Note[];
  integrations: readonly Integration[];
}

/** The formats the summary words times and dates with (`useFormat()`'s). */
export interface SummaryFormat {
  formatTime: (date: Date) => string;
  formatDue: (date: Date) => string;
}

export interface HomeSummary {
  greeting: string;
  /** nothing in the workspace yet: "Welcome to …", the first-run tip, Get started */
  isNew: boolean;
  summary: SummaryPart[];
  section: HomeSectionChoice;
}

const strong = (text: string): SummaryPart => ({ text, tone: 'strong' });
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Good morning" before noon, "Good afternoon" until 6 PM, else "Good evening". */
export function greetingAt(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Today's and tomorrow's meetings, in order: each event's occurrences in that range (a series
 * expanded with `occurrencesBetween`). All-day events, out-of-office and focus time, and declined
 * invitations aren't meetings.
 */
export function meetingsOf(events: readonly Event[], now: Date): Meeting[] {
  const today = DateTime.fromJSDate(now).startOf('day');
  const start = today.toJSDate();
  const end = today.plus({ days: 2 }).toJSDate();
  return events
    .filter(
      (event) =>
        !event.allDay &&
        event.kind === EventKind.DEFAULT &&
        event.response !== EventResponse.DECLINED,
    )
    .flatMap((event) => occurrencesBetween(event, start, end))
    .map((occurrence) => ({
      ...occurrence,
      key: `${occurrence.event.id}:${occurrence.start.getTime()}`,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.key.localeCompare(b.key));
}

/** The steps Get started still offers: a provider not connected yet, and a first project. */
export function setupSteps(
  data: Pick<HomeData, 'integrations' | 'recentProjects'> & Partial<Pick<HomeData, 'dueProjects'>>,
): SetupStep[] {
  const connected = (provider: Provider) => data.integrations.some((i) => i.provider === provider);
  const steps: SetupStep[] = [];
  if (!connected(Provider.GOOGLE_CALENDAR)) steps.push('calendar');
  if (!connected(Provider.LINEAR)) steps.push('linear');
  if (data.recentProjects.length === 0 && !data.dueProjects?.length) steps.push('project');
  return steps;
}

/** The first integration that needs signing in again, for the footer's Reconnect. */
export function pausedIntegration(integrations: readonly Integration[]): Integration | undefined {
  return integrations.find((i) => i.status === IntegrationStatus.NEEDS_REAUTH);
}

/**
 * Chooses Home's greeting, summary and section (README, "Home" › Sections). The section is what
 * comes due soonest: today's next meeting (a meeting within the hour, or running, counts as now),
 * the tasks due today or overdue (now), or a project deadline within 7 days (its day; overdue,
 * now). On a tie, Meetings, then Tasks, then Projects. Tomorrow's meetings don't choose the
 * section. With nothing coming up: the notes opened last, else the recent projects, else Get
 * started.
 */
export function summarizeHome(
  data: HomeData,
  format: SummaryFormat,
  workspaceName: string,
): HomeSummary {
  const { now } = data;
  const at = now.getTime();
  const today = DateTime.fromJSDate(now).startOf('day');
  const tomorrow = today.plus({ days: 1 });

  const meetings = meetingsOf(data.events, now);
  const todays = meetings.filter((m) => m.start < tomorrow.toJSDate());
  const upcoming = todays.filter((m) => m.end.getTime() > at);
  const tomorrows = meetings.filter((m) => m.start >= tomorrow.toJSDate());
  const tasks = [...data.dueTasks];
  const overdue = tasks.filter((task) => task.dueDate && task.dueDate < today.toJSDate()).length;
  const projectsDue = data.dueProjects.filter(
    (p) =>
      p.dueDate &&
      p.status !== ProjectStatus.COMPLETED &&
      p.dueDate < today.plus({ days: PROJECT_DAYS }).toJSDate(),
  );

  const isNew =
    !data.hasTasks &&
    data.recentProjects.length === 0 &&
    data.dueProjects.length === 0 &&
    data.recentNotes.length === 0 &&
    meetings.length === 0 &&
    data.integrations.length === 0;

  const section = chooseSection({
    at,
    upcoming,
    tomorrows,
    tasks,
    projectsDue,
    data,
  });

  return {
    greeting: isNew ? `Welcome to ${workspaceName}` : greetingAt(now),
    isNew,
    summary: isNew
      ? [
          'This is your Home. As you add tasks, notes and meetings, the ones that matter most right now show up here.',
        ]
      : summarize({ data, format, todays, upcoming, tomorrows, tasks, overdue, section }),
    section,
  };
}

function chooseSection({
  at,
  upcoming,
  tomorrows,
  tasks,
  projectsDue,
  data,
}: {
  at: number;
  upcoming: Meeting[];
  tomorrows: Meeting[];
  tasks: TaskListItem[];
  projectsDue: Project[];
  data: HomeData;
}): HomeSectionChoice {
  // when each kind comes due; the earliest wins, in this order on a tie
  const candidates: { kind: 'meetings' | 'tasks' | 'projects'; due: number }[] = [];
  if (upcoming.length > 0)
    candidates.push({ kind: 'meetings', due: Math.max(at, upcoming[0].start.getTime() - SOON) });
  if (tasks.length > 0) candidates.push({ kind: 'tasks', due: at });
  if (projectsDue.length > 0) {
    const day = DateTime.fromJSDate(projectsDue[0].dueDate!).startOf('day').toMillis();
    candidates.push({ kind: 'projects', due: Math.max(at, day) });
  }
  const first = candidates.reduce<(typeof candidates)[number] | undefined>(
    (best, next) => (!best || next.due < best.due ? next : best),
    undefined,
  );

  switch (first?.kind) {
    case 'meetings': {
      const shown = upcoming.slice(0, SECTION_ROWS);
      const rows: MeetingRow[] = shown.map((meeting, index) => ({
        meeting,
        current: index === 0,
        joinable:
          !!meeting.event.meetingUrl &&
          at >= meeting.start.getTime() - JOIN_BEFORE &&
          at < meeting.end.getTime(),
        muted: false,
      }));
      if (rows.length < SECTION_ROWS && tomorrows.length > 0)
        rows.push({ meeting: tomorrows[0], current: false, joinable: false, muted: true });
      return { kind: 'meetings', rows, more: upcoming.length - shown.length };
    }
    case 'tasks':
      return {
        kind: 'tasks',
        rows: tasks.slice(0, SECTION_ROWS),
        total: tasks.length,
        more: Math.max(0, tasks.length - SECTION_ROWS),
      };
    case 'projects':
      return { kind: 'projects', rows: projectsDue.slice(0, SECTION_ROWS), due: true };
  }
  if (data.recentNotes.length > 0)
    return { kind: 'notes', rows: data.recentNotes.slice(0, SECTION_ROWS) };
  const open = data.recentProjects.filter((p) => p.status !== ProjectStatus.COMPLETED);
  if (open.length > 0) return { kind: 'projects', rows: open.slice(0, SECTION_ROWS), due: false };
  const steps = setupSteps(data);
  return steps.length > 0 ? { kind: 'getStarted', steps } : null;
}

function summarize({
  data,
  format,
  todays,
  upcoming,
  tomorrows,
  tasks,
  overdue,
  section,
}: {
  data: HomeData;
  format: SummaryFormat;
  todays: Meeting[];
  upcoming: Meeting[];
  tomorrows: Meeting[];
  tasks: TaskListItem[];
  overdue: number;
  section: HomeSectionChoice;
}): SummaryPart[] {
  const at = data.now.getTime();
  const sentences: SummaryPart[][] = [];

  // a project coming due leads when it is the section
  if (section?.kind === 'projects' && section.due) {
    const project = section.rows[0];
    sentences.push([strong(project.title), ` ${projectDue(project.dueDate!, data.now, format)}.`]);
  }

  const next = upcoming[0];
  const meeting: SummaryPart[] | undefined = next && [
    strong(next.event.title),
    next.start.getTime() <= at
      ? ' is on now.'
      : next.start.getTime() - at < SOON
        ? ` starts ${minutesUntil(next.start.getTime() - at)}.`
        : ` starts at ${format.formatTime(next.start)}.`,
  ];
  const nextTomorrow = tomorrows[0]
    ? ` Your next meeting is tomorrow at ${format.formatTime(tomorrows[0].start)}.`
    : '';

  if (!data.hasTasks) {
    if (meeting) {
      sentences.push(meeting);
      sentences.push(['You don’t have any tasks yet; add one in the box above.']);
    } else {
      const connected = (provider: Provider) =>
        data.integrations.some((i) => i.provider === provider);
      const missing = [
        !connected(Provider.GOOGLE_CALENDAR) && 'your calendar',
        !connected(Provider.LINEAR) && 'Linear',
      ].filter(Boolean);
      sentences.push([
        missing.length > 0
          ? `Nothing on today yet. Add a task above, or connect ${missing.join(' and ')} to bring in your work.`
          : 'Nothing on today yet. Add a task above.',
      ]);
    }
  } else if (tasks.length === 0) {
    if (meeting) {
      sentences.push([{ text: 'Nothing’s due today', tone: 'onTrack' }, '.']);
      sentences.push(meeting);
    } else {
      sentences.push([
        { text: 'Your day is clear', tone: 'onTrack' },
        `: nothing due and ${todays.length > 0 ? 'no more meetings' : 'no meetings'}.${nextTomorrow}`,
      ]);
    }
  } else {
    if (meeting) sentences.push(meeting);
    const count: SummaryPart[] = ['You have ', strong(plural(tasks.length, 'task')), ' today'];
    if (overdue > 0) {
      const all = overdue === tasks.length;
      count.push(', and ', {
        text: all
          ? `${overdue === 1 ? 'it is' : 'all are'} overdue`
          : `${overdue} ${overdue === 1 ? 'is' : 'are'} overdue`,
        tone: 'overdue',
      });
    }
    count.push('.');
    sentences.push(count);
    if (todays.length === 0) sentences.push(['There are no meetings today.']);
    else if (!meeting) sentences.push(['No more meetings today.']);
  }

  // the sentences, one space apart, with neighbouring strings merged
  const parts: SummaryPart[] = [];
  sentences.forEach((sentence, index) => {
    for (const part of index > 0 ? [' ', ...sentence] : sentence) {
      const last = parts[parts.length - 1];
      if (typeof part === 'string' && typeof last === 'string')
        parts[parts.length - 1] = last + part;
      else parts.push(part);
    }
  });
  return parts;
}

/** "in 12 minutes", "in 1 minute", "now" */
function minutesUntil(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE);
  return minutes <= 0 ? 'now' : `in ${plural(minutes, 'minute')}`;
}

/** "is due today", "is due tomorrow", "is due in 3 days", "is overdue" */
function projectDue(dueDate: Date, now: Date, format: SummaryFormat): string {
  const day = DateTime.fromJSDate(dueDate).startOf('day');
  const today = DateTime.fromJSDate(now).startOf('day');
  if (day < today) return 'is overdue';
  const text = format.formatDue(dueDate);
  return /^\d|^[A-Z][a-z]{2} \d/.test(text) ? `is due ${text}` : `is due ${text.toLowerCase()}`;
}

/** The summary as plain text, for tests and labels. */
export function summaryText(parts: readonly SummaryPart[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : part.text)).join('');
}
