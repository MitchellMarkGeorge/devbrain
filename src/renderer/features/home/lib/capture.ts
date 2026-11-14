import { DateTime } from 'luxon';
import type { ProjectId } from '@common/ids';
import { parseNaturalDate } from '@renderer/components';

// Reads the capture box's text (README, "Home"): a date ("tomorrow", "friday", "jul 1"), a time
// for an event ("3pm", "at 10:30") and a project ("#Auth Overhaul", matched against the
// workspace's projects). What it recognises is marked in the field and fills the pickers; the
// rest is the title.

export interface CaptureProject {
  id: ProjectId;
  title: string;
}

export interface ParsedCapture {
  /** the text without what was recognised, spaces collapsed */
  title: string;
  /** the day named, at its start */
  date?: Date;
  /** the time of day named, in minutes after midnight (events only) */
  time?: number;
  project?: CaptureProject;
  /** the recognised words as typed, for the field to mark */
  highlights: string[];
}

export interface ParseCaptureOptions {
  today: Date;
  projects: readonly CaptureProject[];
  /** read a time of day too (the Event mode) */
  times?: boolean;
}

// whole names only: "sun" or "wed" alone are too often words of a title
const WEEKDAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORDINAL = '(?:st|nd|rd|th)?';

/** Date phrases, each with an optional "on", "by" or "due" before it, which goes with it. */
const DATE = new RegExp(
  `(?<![\\w#])(?:(?:on|by|due)\\s+)?(today|tomorrow|next week|(?:next\\s+)?${WEEKDAY}|${MONTH}\\.?\\s+\\d{1,2}${ORDINAL}|\\d{1,2}${ORDINAL}\\s+${MONTH})(?!\\w)`,
  'gi',
);

/** Times: "3pm", "3:30 pm", "15:00", "at 10"; "at" goes with it. */
const TIME =
  /(?<![\w#:])(?:at\s+)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm)|(\d{1,2}):(\d{2}))(?![\w:])|(?<![\w#])at\s+(\d{1,2})(?![\w:])/gi;

interface Match {
  start: number;
  end: number;
}

function lastMatch(text: string, pattern: RegExp, accept: (match: RegExpExecArray) => boolean) {
  let found: RegExpExecArray | undefined;
  for (const match of text.matchAll(pattern)) if (accept(match)) found = match;
  return found;
}

/** A matched date phrase as a day, through `parseNaturalDate`. */
function dateOf(phrase: string, today: Date): Date | undefined {
  const cleaned = phrase
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/(\d)(?:st|nd|rd|th)\b/, '$1');
  return parseNaturalDate(cleaned, today);
}

/** A matched time as minutes after midnight; "at 1"–"at 7" read as the afternoon. */
function timeOf(match: RegExpExecArray): number | undefined {
  const [, hour12, minute12, meridiem, hour24, minute24, bare] = match;
  let hour: number;
  let minute = 0;
  if (hour12 !== undefined) {
    hour = Number(hour12);
    minute = Number(minute12 ?? 0);
    if (hour < 1 || hour > 12) return undefined;
    const pm = meridiem.toLowerCase() === 'pm';
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour24 !== undefined) {
    hour = Number(hour24);
    minute = Number(minute24);
  } else {
    hour = Number(bare);
    if (hour >= 1 && hour <= 7) hour += 12;
  }
  if (hour > 23 || minute > 59) return undefined;
  return hour * 60 + minute;
}

/** The project a "#" names: the longest title the text after it starts with, as a whole word. */
function projectAt(
  text: string,
  hash: number,
  projects: readonly CaptureProject[],
): CaptureProject | undefined {
  const rest = text.slice(hash + 1).toLowerCase();
  let best: CaptureProject | undefined;
  for (const project of projects) {
    const title = project.title.toLowerCase();
    if (!title || !rest.startsWith(title)) continue;
    const after = rest.charAt(title.length);
    if (after && /\w/.test(after)) continue;
    if (!best || title.length > best.title.length) best = project;
  }
  return best;
}

/**
 * Reads `text` for a date, a time (with `times`) and a `#project`. When a kind of thing is
 * named twice, the last one counts ("tomorrow, no, friday").
 */
export function parseCapture(text: string, options: ParseCaptureOptions): ParsedCapture {
  const taken: Match[] = [];
  const highlights: string[] = [];
  const free = (start: number, end: number) =>
    taken.every((range) => end <= range.start || start >= range.end);
  const take = (start: number, end: number) => {
    taken.push({ start, end });
    highlights.push(text.slice(start, end));
  };
  const result: ParsedCapture = { title: '', highlights };

  // the project first: its title can hold words that read as a date ("#Q3 launch friday")
  let project: { project: CaptureProject; start: number; end: number } | undefined;
  for (let hash = text.indexOf('#'); hash !== -1; hash = text.indexOf('#', hash + 1)) {
    if (hash > 0 && /\w/.test(text.charAt(hash - 1))) continue;
    const found = projectAt(text, hash, options.projects);
    if (found) project = { project: found, start: hash, end: hash + 1 + found.title.length };
  }
  if (project) {
    take(project.start, project.end);
    result.project = project.project;
  }

  if (options.times) {
    const time = lastMatch(
      text,
      TIME,
      (m) => free(m.index, m.index + m[0].length) && timeOf(m) !== undefined,
    );
    if (time) {
      take(time.index, time.index + time[0].length);
      result.time = timeOf(time);
    }
  }

  const date = lastMatch(
    text,
    DATE,
    (m) => free(m.index, m.index + m[0].length) && dateOf(m[1], options.today) !== undefined,
  );
  if (date) {
    take(date.index, date.index + date[0].length);
    result.date = DateTime.fromJSDate(dateOf(date[1], options.today)!).startOf('day').toJSDate();
  }

  let title = '';
  let at = 0;
  for (const range of [...taken].sort((a, b) => a.start - b.start)) {
    title += `${text.slice(at, range.start)} `;
    at = range.end;
  }
  title += text.slice(at);
  result.title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();
  // the marks in the order they appear, as the field draws them
  highlights.sort((a, b) => text.indexOf(a) - text.indexOf(b));
  return result;
}

/**
 * When a new event starts: the day and time named, else today at the next half hour (or 9 AM on
 * another day).
 */
export function eventStart(parsed: Pick<ParsedCapture, 'date' | 'time'>, now: Date): Date {
  const today = DateTime.fromJSDate(now).startOf('day');
  const day = parsed.date ? DateTime.fromJSDate(parsed.date).startOf('day') : today;
  if (parsed.time !== undefined) return day.plus({ minutes: parsed.time }).toJSDate();
  if (+day !== +today) return day.set({ hour: 9 }).toJSDate();
  const current = DateTime.fromJSDate(now);
  const next = current.startOf('hour').plus({ minutes: current.minute < 30 ? 30 : 60 });
  return next.toJSDate();
}

/** The settings' default event length, in minutes. */
export function eventMinutes(setting: '15m' | '30m' | '1h' | undefined): number {
  return setting === '15m' ? 15 : setting === '1h' ? 60 : 30;
}
