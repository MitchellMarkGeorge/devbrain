import { describe, expect, it } from 'vitest';
import type { ProjectId } from '@common/ids';
import { eventMinutes, eventStart, parseCapture } from '@renderer/features/home/lib/capture';

// The capture box's parser: a date, a time (events) and a #project out of the text, the rest the
// title. Today is Tuesday 10 Nov 2026.

const TODAY = new Date(2026, 10, 10);
const day = (month: number, date: number, year = 2026) => new Date(year, month, date);
const PROJECTS = [
  { id: 'prj_auth' as ProjectId, title: 'Auth Overhaul' },
  { id: 'prj_auth2' as ProjectId, title: 'Auth' },
  { id: 'prj_gw' as ProjectId, title: 'API Gateway v2' },
];
const parse = (text: string, times = false) =>
  parseCapture(text, { today: TODAY, projects: PROJECTS, times });

describe('parseCapture', () => {
  it('reads Figma’s example: a date and a project', () => {
    expect(parse('Write rollout plan for PKCE tomorrow #Auth Overhaul')).toEqual({
      title: 'Write rollout plan for PKCE',
      date: day(10, 11),
      project: PROJECTS[0],
      highlights: ['tomorrow', '#Auth Overhaul'],
    });
  });

  it('leaves plain text alone', () => {
    expect(parse('Refactor token refresh logic')).toEqual({
      title: 'Refactor token refresh logic',
      highlights: [],
    });
    expect(parse('   ')).toEqual({ title: '', highlights: [] });
  });

  it.each([
    ['today', day(10, 10)],
    ['tomorrow', day(10, 11)],
    ['next week', day(10, 16)],
    ['friday', day(10, 13)],
    ['next friday', day(10, 13)],
    ['tuesday', day(10, 17)],
    ['Jul 1', day(6, 1, 2027)],
    ['dec 3rd', day(11, 3)],
    ['3 December', day(11, 3)],
    ['Sept. 4', day(8, 4, 2027)],
  ])('reads "%s" as a day', (phrase, date) => {
    const parsed = parse(`Ship it ${phrase}`);
    expect(parsed.date).toEqual(date);
    expect(parsed.title).toBe('Ship it');
    expect(parsed.highlights).toEqual([phrase]);
  });

  it('takes "on", "by" and "due" with the date', () => {
    expect(parse('Send invoice by friday')).toMatchObject({
      title: 'Send invoice',
      highlights: ['by friday'],
    });
    expect(parse('Demo on Jul 1, then rest')).toMatchObject({
      title: 'Demo, then rest',
      date: day(6, 1, 2027),
    });
  });

  it('reads the date anywhere, and the last one when there are two', () => {
    expect(parse('tomorrow write the plan')).toMatchObject({ title: 'write the plan' });
    expect(parse('Plan today’s demo tomorrow')).toMatchObject({
      title: 'Plan today’s demo',
      date: day(10, 11),
    });
  });

  it('does not read parts of words, or short words that are often titles', () => {
    expect(parse('Fix the yesterdays bug').date).toBeUndefined();
    expect(parse('Check sun glare on wed site').date).toBeUndefined();
    expect(parse('Review the may release').date).toBeUndefined();
    expect(parse('Upgrade to v12 3').date).toBeUndefined();
  });

  it('matches the longest project title after #, as a whole word, in any case', () => {
    expect(parse('Audit #auth overhaul storage')).toMatchObject({
      title: 'Audit storage',
      project: PROJECTS[0],
      highlights: ['#auth overhaul'],
    });
    expect(parse('Audit #Auth tokens').project).toEqual(PROJECTS[1]);
    expect(parse('Audit #Authentication').project).toBeUndefined();
    expect(parse('Audit #Unknown').title).toBe('Audit #Unknown');
    expect(parse('Issue#Auth').project).toBeUndefined();
  });

  it('keeps a project title that reads as a date out of the date', () => {
    const projects = [{ id: 'prj_fri' as ProjectId, title: 'Launch friday' }];
    expect(parseCapture('Prep #Launch friday', { today: TODAY, projects })).toMatchObject({
      title: 'Prep',
      project: projects[0],
    });
    expect(parseCapture('Prep #Launch friday', { today: TODAY, projects }).date).toBeUndefined();
  });

  it('reads a time only for events', () => {
    expect(parse('Design sync at 3pm').time).toBeUndefined();
    expect(parse('Design sync at 3pm', true)).toEqual({
      title: 'Design sync',
      time: 15 * 60,
      highlights: ['at 3pm'],
    });
  });

  it.each([
    ['3pm', 15 * 60],
    ['3:30 pm', 15 * 60 + 30],
    ['12am', 0],
    ['12pm', 12 * 60],
    ['15:00', 15 * 60],
    ['at 9:15', 9 * 60 + 15],
    ['at 10', 10 * 60],
    ['at 3', 15 * 60],
  ])('reads "%s" as a time', (phrase, minutes) => {
    expect(parse(`Sync ${phrase}`, true)).toMatchObject({ title: 'Sync', time: minutes });
  });

  it('reads a day and a time together', () => {
    expect(parse('Retro tomorrow at 10:30am #API Gateway v2', true)).toEqual({
      title: 'Retro',
      date: day(10, 11),
      time: 10 * 60 + 30,
      project: PROJECTS[2],
      highlights: ['tomorrow', 'at 10:30am', '#API Gateway v2'],
    });
  });

  it('ignores times that are not times', () => {
    expect(parse('Sync 25:00', true).time).toBeUndefined();
    expect(parse('Sync 13pm', true).time).toBeUndefined();
    expect(parse('Read RFC 7231', true).time).toBeUndefined();
  });
});

describe('eventStart', () => {
  const now = new Date(2026, 10, 10, 9, 48);
  it('starts at the day and time named', () => {
    expect(eventStart({ date: day(10, 11), time: 15 * 60 }, now)).toEqual(
      new Date(2026, 10, 11, 15),
    );
    expect(eventStart({ time: 15 * 60 }, now)).toEqual(new Date(2026, 10, 10, 15));
  });
  it('starts at the next half hour today, or 9 AM on another day', () => {
    expect(eventStart({}, now)).toEqual(new Date(2026, 10, 10, 10));
    expect(eventStart({}, new Date(2026, 10, 10, 9, 10))).toEqual(new Date(2026, 10, 10, 9, 30));
    expect(eventStart({ date: day(10, 12) }, now)).toEqual(new Date(2026, 10, 12, 9));
  });
  it('lasts as long as the setting says', () => {
    expect(eventMinutes('15m')).toBe(15);
    expect(eventMinutes('1h')).toBe(60);
    expect(eventMinutes(undefined)).toBe(30);
  });
});
