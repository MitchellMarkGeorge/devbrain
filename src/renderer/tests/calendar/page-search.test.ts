// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import FullCalendar, { type CalendarRef } from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import type { AppSettings } from '@common/types';
import {
  calendarSearchSchema,
  dateParam,
  resolveCalendarSearch,
  type CalendarViewParam,
} from '../../pages/calendar/search';
import {
  monthTitle,
  neighbouringRanges,
  rangeOptionsOf,
  stepDate,
  visibleRange,
  type CalendarRangeOptions,
} from '../../pages/calendar/range';

// The calendar page's URL (?view, ?date, ?open, ?occurrence) and the ranges it derives from it:
// what FullCalendar shows for a view and an anchor day, with the week starting on Monday or
// Sunday and weekends hidden or not.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS: Pick<AppSettings, 'calendar'> = {
  calendar: {
    defaultEventDuration: '30m',
    firstDayOfWeek: 'monday',
    defaultView: 'week',
    hideWeekends: false,
  },
};

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const days = (range: { start: Date; end: Date }) => [dateParam(range.start), dateParam(range.end)];

describe('the search schema', () => {
  it('takes each param as the URL writes it', () => {
    expect(
      calendarSearchSchema.parse({
        view: 'month',
        date: '2026-06-24',
        open: 'evt_standup',
        occurrence: '2026-06-24T13:00:00.000Z',
      }),
    ).toEqual({
      view: 'month',
      date: '2026-06-24',
      open: 'evt_standup',
      occurrence: '2026-06-24T13:00:00.000Z',
    });
    expect(calendarSearchSchema.parse({ open: 'tsk_guide' })).toEqual({ open: 'tsk_guide' });
  });

  it('drops a bad value back to its default, keeping the rest', () => {
    expect(
      calendarSearchSchema.parse({
        view: 'year',
        date: '2026-02-30',
        open: 'prj_api',
        occurrence: 'yesterday',
      }),
    ).toEqual({});
    expect(calendarSearchSchema.parse({ view: 'day', date: '24/06/2026' })).toEqual({
      view: 'day',
    });
  });

  it('resolves a missing view from the setting, and a missing date to today', () => {
    const today = new Date(2026, 5, 24, 15, 30);
    const resolved = resolveCalendarSearch({}, SETTINGS, today);
    expect(resolved.view).toBe('week');
    expect(resolved.date).toEqual(day('2026-06-24'));
    expect(resolved.isToday).toBe(true);
    const month = { calendar: { ...SETTINGS.calendar, defaultView: 'month' as const } };
    expect(resolveCalendarSearch({}, month, today).view).toBe('month');
    expect(resolveCalendarSearch({ view: 'day' }, month, today).view).toBe('day');
  });

  it('reads the occurrence only with an event open', () => {
    const occurrence = '2026-06-24T13:00:00.000Z';
    const today = new Date(2026, 5, 24);
    expect(
      resolveCalendarSearch({ open: 'evt_standup' as never, occurrence }, SETTINGS, today)
        .occurrence,
    ).toEqual(new Date(occurrence));
    expect(
      resolveCalendarSearch({ open: 'tsk_guide' as never, occurrence }, SETTINGS, today).occurrence,
    ).toBeUndefined();
  });
});

const MONDAY: CalendarRangeOptions = { firstDay: 1, hideWeekends: false };
const SUNDAY: CalendarRangeOptions = { firstDay: 0, hideWeekends: false };

describe('the visible range', () => {
  // Wednesday 24 June 2026; June starts on a Monday and ends on a Tuesday
  const wednesday = day('2026-06-24');

  it('is the week the day is in, from the first day of the week', () => {
    expect(days(visibleRange('week', wednesday, MONDAY))).toEqual(['2026-06-22', '2026-06-29']);
    expect(days(visibleRange('week', wednesday, SUNDAY))).toEqual(['2026-06-21', '2026-06-28']);
    // a Sunday ends a Monday week, and starts a Sunday one
    expect(days(visibleRange('week', day('2026-06-28'), MONDAY))).toEqual([
      '2026-06-22',
      '2026-06-29',
    ]);
    expect(days(visibleRange('week', day('2026-06-28'), SUNDAY))).toEqual([
      '2026-06-28',
      '2026-07-05',
    ]);
  });

  it('is the day itself in the day view', () => {
    expect(days(visibleRange('day', wednesday, MONDAY))).toEqual(['2026-06-24', '2026-06-25']);
  });

  it('is the weeks of the month in the month view', () => {
    expect(days(visibleRange('month', wednesday, MONDAY))).toEqual(['2026-06-01', '2026-07-06']);
    expect(days(visibleRange('month', wednesday, SUNDAY))).toEqual(['2026-05-31', '2026-07-05']);
  });

  it('trims hidden weekends off either end', () => {
    const weekdays = { ...MONDAY, hideWeekends: true };
    expect(days(visibleRange('week', wednesday, weekdays))).toEqual(['2026-06-22', '2026-06-27']);
    expect(days(visibleRange('week', wednesday, { ...SUNDAY, hideWeekends: true }))).toEqual([
      '2026-06-22',
      '2026-06-27',
    ]);
    expect(days(visibleRange('month', wednesday, weekdays))).toEqual(['2026-06-01', '2026-07-04']);
  });

  it('shows weekends in the day view whatever the setting', () => {
    const weekdays = { calendar: { ...SETTINGS.calendar, hideWeekends: true } };
    expect(rangeOptionsOf(weekdays, 'day').hideWeekends).toBe(false);
    expect(rangeOptionsOf(weekdays, 'week').hideWeekends).toBe(true);
    const sunday = { calendar: { ...SETTINGS.calendar, firstDayOfWeek: 'sunday' as const } };
    expect(rangeOptionsOf(sunday, 'week').firstDay).toBe(0);
  });

  it('steps a view at a time, and prefetches the ranges either side', () => {
    expect(dateParam(stepDate('week', wednesday, 1))).toBe('2026-07-01');
    expect(dateParam(stepDate('day', wednesday, -1))).toBe('2026-06-23');
    expect(dateParam(stepDate('month', wednesday, 1))).toBe('2026-07-24');
    // the 31st steps to the end of a shorter month
    expect(dateParam(stepDate('month', day('2026-01-31'), 1))).toBe('2026-02-28');
    expect(neighbouringRanges('week', wednesday, MONDAY).map(days)).toEqual([
      ['2026-06-15', '2026-06-22'],
      ['2026-06-29', '2026-07-06'],
    ]);
  });

  it('titles the page with the anchor’s month', () => {
    expect(monthTitle(wednesday)).toBe('June 2026');
    expect(monthTitle(wednesday, 'short')).toBe('Jun 2026');
  });
});

// the range FullCalendar itself shows (its activeRange), with the options CalendarView passes it
function fullCalendarRange(view: CalendarViewParam, date: Date, options: CalendarRangeOptions) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const calendar = createRef<CalendarRef>();
  const type = { week: 'timeGridWeek', day: 'timeGridDay', month: 'dayGridMonth' }[view];
  act(() =>
    root.render(
      createElement(FullCalendar, {
        ref: calendar,
        plugins: [timeGridPlugin, dayGridPlugin],
        initialView: type,
        initialDate: date,
        timeZone: 'local',
        firstDay: options.firstDay,
        weekends: !options.hideWeekends,
        fixedWeekCount: false,
      }),
    ),
  );
  const { activeStart, activeEnd } = calendar.current!.getApi().view;
  act(() => root.unmount());
  el.remove();
  return [dateParam(activeStart), dateParam(activeEnd)];
}

describe('the visible range agrees with FullCalendar', () => {
  const anchors = ['2026-06-24', '2026-06-28', '2026-03-01', '2026-11-30', '2027-02-14'];
  const views: CalendarViewParam[] = ['week', 'day', 'month'];
  const options: CalendarRangeOptions[] = [
    MONDAY,
    SUNDAY,
    { ...MONDAY, hideWeekends: true },
    { ...SUNDAY, hideWeekends: true },
  ];
  for (const view of views) {
    for (const option of options) {
      // the page never hides weekends in the day view
      if (view === 'day' && option.hideWeekends) continue;
      it(`${view}, week from ${option.firstDay ? 'Monday' : 'Sunday'}${
        option.hideWeekends ? ', weekends hidden' : ''
      }`, () => {
        for (const anchor of anchors) {
          expect(days(visibleRange(view, day(anchor), option)), anchor).toEqual(
            fullCalendarRange(view, day(anchor), option),
          );
        }
      });
    }
  }
});
