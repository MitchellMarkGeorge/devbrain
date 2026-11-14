import { describe, expect, it } from 'vitest';
import type { CalendarId } from '@common/ids';
import { TaskStatus } from '@common/types';
import {
  defaultCalendar,
  defaultDurationMinutes,
  draftForDay,
  draftFromSelection,
  meetingUrlOf,
} from '@renderer/features/calendar/components/create/CreateEventDialog';
import { agendaItems } from '@renderer/features/calendar/components/panel/CalendarSidePanel';
import { fakeTask } from '../../routing/fake-tasks';
import { WORK, event, id } from '../../fixtures/calendar';

// What the New event dialog starts with, and the agenda's order.

const at = (hour: number, minute = 0, day = 24) => new Date(2026, 5, day, hour, minute);

describe('a new event’s range', () => {
  it('keeps a dragged range, and gives a click the default length', () => {
    const drag = { start: at(13), end: at(14, 30), allDay: false };
    expect(draftFromSelection(drag, 30)).toEqual(drag);
    // a click selects one 15 minute slot
    expect(draftFromSelection({ start: at(13), end: at(13, 15), allDay: false }, 60)).toEqual({
      start: at(13),
      end: at(14),
      allDay: false,
    });
    const month = { start: new Date(2026, 5, 24), end: new Date(2026, 5, 25), allDay: true };
    expect(draftFromSelection(month, 60)).toEqual(month);
  });

  it('starts New Event at the next hour today, and at 9:00 on another day', () => {
    const now = at(10, 20);
    expect(draftForDay(new Date(2026, 5, 24), now, 30)).toEqual({
      start: at(11),
      end: at(11, 30),
      allDay: false,
    });
    expect(draftForDay(new Date(2026, 5, 26), now, 60)).toEqual({
      start: at(9, 0, 26),
      end: at(10, 0, 26),
      allDay: false,
    });
  });

  it('lasts the setting’s default', () => {
    expect(defaultDurationMinutes({ calendar: { defaultEventDuration: '15m' } as never })).toBe(15);
    expect(defaultDurationMinutes(undefined)).toBe(60);
  });

  it('goes on a local calendar, never a synced one', () => {
    const google = { ...WORK, id: 'cal_g' as CalendarId, sourceId: 'src_g' as never };
    expect(defaultCalendar([google, WORK])?.id).toBe(WORK.id);
    expect(defaultCalendar([google])).toBeUndefined();
  });

  it('takes a meeting link without its scheme, and refuses one it can’t open', () => {
    expect(meetingUrlOf('')).toBeUndefined();
    expect(meetingUrlOf('meet.example.com/pkce-sync')).toBe('https://meet.example.com/pkce-sync');
    expect(meetingUrlOf('javascript:alert(1)')).toBeNull();
  });
});

describe('the agenda', () => {
  it('lists the day’s all-day events, then the rest by start, a series expanded, then tasks due', () => {
    const standup = event({
      id: id('evt_standup'),
      title: 'Standup',
      startAt: at(9, 30, 22),
      endAt: at(9, 45, 22),
      recurrenceRule: 'RRULE:FREQ=DAILY',
    });
    const review = event({ id: id('evt_review'), title: 'Review', startAt: at(13), endAt: at(14) });
    const course = event({
      id: id('evt_course'),
      title: 'Course',
      allDay: true,
      startDate: '2026-06-24',
      endDate: '2026-06-25',
      startAt: new Date(2026, 5, 24),
      endAt: new Date(2026, 5, 25),
    });
    const tomorrow = event({
      id: id('evt_t'),
      title: 'Tomorrow',
      startAt: at(8, 0, 25),
      endAt: at(9, 0, 25),
    });
    const task = fakeTask('tsk_guide', 'Write guide', { status: TaskStatus.NOT_STARTED });
    const items = agendaItems([review, standup, course, tomorrow], [task], new Date(2026, 5, 24));
    expect(
      items.map((item) => (item.kind === 'event' ? item.occurrence.event.title : item.task.title)),
    ).toEqual(['Course', 'Standup', 'Review', 'Write guide']);
    const occurrence = items[1];
    expect(occurrence.kind === 'event' && occurrence.occurrence.start).toEqual(at(9, 30));
  });
});
