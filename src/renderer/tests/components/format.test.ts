import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import { createFormat, dueText } from '@renderer/components/lib/format';
import { eventCountdown, eventTimeRange, repeatLabel } from '@renderer/components/event-text';
import { dueTone, isOverdue, resolveColor, showsOverdueFlag } from '@renderer/components/types';

// Monday 22 June 2026, 9:48 AM local time, as the stories use
const NOW = new Date(2026, 5, 22, 9, 48);
const day = (days: number, hours = 0, minutes = 0) => new Date(2026, 5, 22 + days, hours, minutes);
const format = createFormat(NOW);

describe('formatDue', () => {
  it('words a date within a week of today relatively, and anything further as a short date', () => {
    expect(format.formatDue(day(0, 17))).toBe('Today');
    expect(format.formatDue(day(1))).toBe('Tomorrow');
    expect(format.formatDue(day(-1))).toBe('Yesterday');
    expect(format.formatDue(day(3))).toBe('In 3 days');
    expect(format.formatDue(day(-6))).toBe('6 days ago');
    expect(format.formatDue(day(7))).toBe('Jun 29');
    expect(format.formatDue(day(9))).toBe('Jul 1');
  });

  it('reads as a phrase in dueText', () => {
    expect(dueText(day(0), format)).toBe('Due today');
    expect(dueText(day(9), format)).toBe('Due Jul 1');
  });
});

describe('formatTime', () => {
  it('follows the time format', () => {
    expect(createFormat(NOW, '12').formatTime(day(0, 13, 5))).toBe('1:05 PM');
    expect(createFormat(NOW, '24').formatTime(day(0, 13, 5))).toBe('13:05');
  });
});

describe('formatRelative', () => {
  it('counts from now in the largest whole unit, narrow and capitalised', () => {
    expect(format.formatRelative(day(0, 10))).toBe('In 12m');
    expect(format.formatRelative(day(0, 7, 48))).toBe('2h ago');
    expect(format.formatRelative(day(-1, 9))).toBe('Yesterday');
    expect(format.formatRelative(day(-3, 9))).toBe('3d ago');
    expect(format.formatRelative(day(-28))).toBe('4w ago');
    expect(format.formatRelative(day(-400))).toBe('1y ago');
    expect(format.formatRelative(new Date(NOW.getTime() - 20_000))).toBe('Now');
  });
});

describe('overdue', () => {
  it('is an open task due before today', () => {
    expect(isOverdue(TaskStatus.NOT_STARTED, day(-1, 23), NOW)).toBe(true);
    expect(isOverdue(TaskStatus.IN_PROGRESS, day(-1), NOW)).toBe(true);
    expect(isOverdue(TaskStatus.NOT_STARTED, day(0), NOW)).toBe(false);
    expect(isOverdue(TaskStatus.COMPLETED, day(-1), NOW)).toBe(false);
    expect(isOverdue(TaskStatus.CANCELLED, day(-1), NOW)).toBe(false);
    expect(isOverdue(TaskStatus.NOT_STARTED, null, NOW)).toBe(false);
  });

  it('shows the flag only on a task not started', () => {
    expect(showsOverdueFlag(TaskStatus.NOT_STARTED, true)).toBe(true);
    expect(showsOverdueFlag(TaskStatus.IN_PROGRESS, true)).toBe(false);
  });

  it('tones an open task due today or overdue, and never a closed one', () => {
    expect(dueTone(TaskStatus.NOT_STARTED, day(0), NOW)).toBe('today');
    expect(dueTone(TaskStatus.IN_PROGRESS, day(-2), NOW)).toBe('overdue');
    expect(dueTone(TaskStatus.COMPLETED, day(0), NOW)).toBeUndefined();
    expect(dueTone(TaskStatus.NOT_STARTED, day(2), NOW)).toBeUndefined();
  });
});

describe('resolveColor', () => {
  it('takes swatch names and #rrggbb, and falls back for anything else', () => {
    expect(resolveColor('blue')).toBe('var(--swatch-blue)');
    expect(resolveColor('#1a2B3c')).toBe('#1a2B3c');
    expect(resolveColor('red; background: url(x)')).toBeUndefined();
    expect(resolveColor('#fff', 'green')).toBe('var(--swatch-green)');
    expect(resolveColor(null, 'green')).toBe('var(--swatch-green)');
  });
});

describe('event text', () => {
  const event = { startAt: day(0, 10), endAt: day(0, 10, 30), allDay: false };

  it('words a time range and an all-day event', () => {
    expect(eventTimeRange(event, format)).toBe('10:00 AM – 10:30 AM');
    expect(eventTimeRange({ ...event, allDay: true }, format)).toBe('All day');
  });

  it('words how a series repeats', () => {
    expect(repeatLabel('RRULE:FREQ=WEEKLY;BYDAY=TU')).toBe('Weekly');
    expect(repeatLabel('RRULE:FREQ=WEEKLY;BYDAY=TU', 'long')).toBe('Every week on Tuesday');
    expect(repeatLabel('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Weekdays');
    expect(repeatLabel('RRULE:FREQ=MONTHLY;INTERVAL=2')).toBe('Every 2 months');
    expect(repeatLabel('EXDATE:20260623T100000Z\nRRULE:FREQ=DAILY')).toBe('Daily');
    expect(repeatLabel(null)).toBeUndefined();
    expect(repeatLabel('RRULE:FREQ=HOURLY')).toBeUndefined();
  });

  it('counts down to an event, red within the hour and while it runs', () => {
    expect(eventCountdown(event, format)).toMatchObject({ tone: 'soon' });
    expect(eventCountdown({ ...event, startAt: day(0, 9, 30) }, format)).toEqual({
      text: 'Now',
      tone: 'soon',
    });
    expect(eventCountdown({ ...event, startAt: day(0, 14), endAt: day(0, 15) }, format).tone).toBe(
      'today',
    );
    expect(eventCountdown({ ...event, startAt: day(1, 9), endAt: day(1, 10) }, format).tone).toBe(
      undefined,
    );
  });
});
