import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import type { ProjectId } from '@common/ids';

// Reads the capture box's text (README, "Home"): a date ("tomorrow", "next friday", "in 3 days"),
// a time for an event ("3pm", "at 10:30"), both as chrono reads them
// (https://github.com/wanasit/chrono), and a project ("#Auth Overhaul", matched against the
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

/** A weekday's short name alone ("sun", "wed"): too often a word of a title to read as a date. */
const SHORT_WEEKDAY = /^(?:on\s+)?(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\.?$/i;

/** A match naming one of these is a date; one naming only an hour is a time. */
const DATE_PARTS: chrono.Component[] = ['day', 'weekday', 'month'];

/** "on", "by" or "due" just before a date goes with it. */
const LEAD = /(?:^|\s)((?:on|by|due)\s+)$/i;

interface Match {
  start: number;
  end: number;
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

  // chrono reads the rest, the project blanked out so its title is not read as a date
  const blanked = project
    ? text.slice(0, project.start) +
      ' '.repeat(project.end - project.start) +
      text.slice(project.end)
    : text;
  const found = chrono
    .parse(blanked, DateTime.fromJSDate(options.today).startOf('day').toJSDate(), {
      forwardDate: true,
    })
    .filter((match) => !SHORT_WEEKDAY.test(match.text))
    .map((match) => {
      const { start } = match;
      const isDate = DATE_PARTS.some((part) => start.isCertain(part));
      const isTime = options.times === true && start.isCertain('hour');
      return { match, isDate, isTime };
    })
    .filter(({ isDate, isTime }) => isDate || isTime);
  // the day and the time each from the last match naming one ("tomorrow, no, friday"); one
  // match can name both ("tomorrow at 3pm")
  const dated = [...found].reverse().find((f) => f.isDate);
  const timed = [...found].reverse().find((f) => f.isTime);
  for (const { match } of new Set([dated, timed].filter((f) => f !== undefined))) {
    const lead = LEAD.exec(blanked.slice(0, match.index))?.[1] ?? '';
    take(match.index - lead.length, match.index + match.text.length);
  }
  if (dated) result.date = DateTime.fromJSDate(dated.match.start.date()).startOf('day').toJSDate();
  if (timed) {
    const time = DateTime.fromJSDate(timed.match.start.date());
    result.time = time.hour * 60 + time.minute;
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
