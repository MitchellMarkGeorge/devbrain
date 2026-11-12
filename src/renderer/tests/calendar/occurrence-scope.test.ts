import { describe, expect, it } from 'vitest';
import type { CalendarId } from '@common/ids';
import {
  deleteScopes,
  editScopes,
  planDelete,
  planEdit,
  seriesOccurrenceOf,
  type EventTarget,
} from '../../pages/calendar/edit/occurrence';
import { canSplit, repeatPresetOf, repeatRule } from '../../pages/calendar/repeat';
import { event, id } from './fixtures';

// The event sheet's occurrence-scope choices (docs/calendar/fullcalendar-adapter.md, "Editing and
// deleting a recurring event"): which choices an edit or delete of an occurrence offers, and the
// route and input each choice calls.

const H = 60 * 60_000;

// a daily 9:00 standup from Monday 5 October 2026, an hour long
const series = event({
  id: id('evt_standup'),
  title: 'Standup',
  startAt: new Date('2026-10-05T13:00:00Z'),
  endAt: new Date('2026-10-05T14:00:00Z'),
  timeZone: 'America/Toronto',
  recurrenceRule: 'RRULE:FREQ=DAILY',
});
// Thursday's occurrence, as FullCalendar expanded it
const thursday = new Date('2026-10-08T13:00:00Z');
const expanded: EventTarget = { event: series, occurrenceStart: thursday };
// Wednesday's, moved to 10:00: an occurrence row
const movedRow = event({
  id: id('evt_standup_wed'),
  title: 'Standup',
  startAt: new Date('2026-10-07T14:00:00Z'),
  endAt: new Date('2026-10-07T15:00:00Z'),
  seriesId: series.id,
  originalStartAt: new Date('2026-10-07T13:00:00Z'),
});
const oneOff = event({
  id: id('evt_review'),
  startAt: new Date('2026-10-06T17:00:00Z'),
  endAt: new Date('2026-10-06T18:00:00Z'),
});

describe('the occurrence a target is', () => {
  it('is none for a one-off', () => {
    expect(seriesOccurrenceOf({ event: oneOff })).toBeNull();
  });

  it('is the clicked start of an expanded occurrence, lasting as the series does', () => {
    expect(seriesOccurrenceOf(expanded)).toEqual({
      seriesId: series.id,
      originalStartAt: thursday,
      start: thursday,
      end: new Date(thursday.getTime() + H),
    });
  });

  it('is the series’ first when the URL named no occurrence', () => {
    expect(seriesOccurrenceOf({ event: series })?.originalStartAt).toEqual(series.startAt);
  });

  it('is an occurrence row’s own series and original start, drawn where it moved', () => {
    expect(seriesOccurrenceOf({ event: movedRow })).toEqual({
      seriesId: series.id,
      originalStartAt: movedRow.originalStartAt,
      start: movedRow.startAt,
      end: movedRow.endAt,
    });
  });
});

describe('the choices offered', () => {
  const available = (choices: { scope: string; unavailable?: string }[]) =>
    choices.filter((choice) => !choice.unavailable).map((choice) => choice.scope);

  it('offers all three for a change of title, time or place', () => {
    expect(available(editScopes({ title: 'Sync' }, series.recurrenceRule))).toEqual([
      'this',
      'following',
      'all',
    ]);
    expect(available(deleteScopes(series.recurrenceRule))).toEqual(['this', 'following', 'all']);
  });

  it('leaves out "This event" for a new calendar or rule: an occurrence repeats with its series', () => {
    expect(
      available(editScopes({ calendarId: 'cal_home' as CalendarId }, series.recurrenceRule)),
    ).toEqual(['following', 'all']);
    expect(available(editScopes({ recurrenceRule: null }, series.recurrenceRule))).toEqual([
      'following',
      'all',
    ]);
  });

  it('leaves out "This and following" for a rule core can’t split', () => {
    for (const rule of [
      'RRULE:FREQ=DAILY\nRDATE:20261010T090000',
      'RRULE:FREQ=DAILY\nEXRULE:FREQ=WEEKLY;BYDAY=SA',
      'RRULE:FREQ=WEEKLY;BYDAY=MO\nRRULE:FREQ=WEEKLY;BYDAY=TH',
    ]) {
      expect(canSplit(rule), rule).toBe(false);
      expect(available(editScopes({ title: 'Sync' }, rule))).toEqual(['this', 'all']);
      expect(available(deleteScopes(rule))).toEqual(['this', 'all']);
    }
    expect(canSplit('RRULE:FREQ=DAILY\nEXDATE:20261009T090000')).toBe(true);
  });
});

describe('the call each choice makes', () => {
  it('updates and deletes a one-off directly, whatever the scope', () => {
    expect(planEdit({ event: oneOff }, 'this', { title: 'Review' })).toEqual({
      route: 'update',
      input: { id: oneOff.id, title: 'Review' },
    });
    expect(planDelete({ event: oneOff }, 'all')).toEqual({
      route: 'delete',
      input: { id: oneOff.id },
    });
  });

  it('sends "This event" and "This and following" to the occurrence routes', () => {
    const later = {
      startAt: new Date(thursday.getTime() + H),
      endAt: new Date(thursday.getTime() + 2 * H),
    };
    expect(planEdit(expanded, 'this', later)).toEqual({
      route: 'updateOccurrence',
      input: { seriesId: series.id, originalStartAt: thursday, scope: 'this', ...later },
    });
    expect(planEdit(expanded, 'following', { location: 'Room 2A' })).toEqual({
      route: 'updateOccurrence',
      input: {
        seriesId: series.id,
        originalStartAt: thursday,
        scope: 'following',
        location: 'Room 2A',
      },
    });
    expect(planDelete(expanded, 'this')).toEqual({
      route: 'deleteOccurrence',
      input: { seriesId: series.id, originalStartAt: thursday, scope: 'this' },
    });
    expect(planDelete(expanded, 'following')).toEqual({
      route: 'deleteOccurrence',
      input: { seriesId: series.id, originalStartAt: thursday, scope: 'following' },
    });
  });

  it('names an occurrence row by its series and original start, never where it moved', () => {
    expect(planEdit({ event: movedRow }, 'this', { title: 'Sync' })).toEqual({
      route: 'updateOccurrence',
      input: {
        seriesId: series.id,
        originalStartAt: movedRow.originalStartAt,
        scope: 'this',
        title: 'Sync',
      },
    });
    expect(planDelete({ event: movedRow }, 'all')).toEqual({
      route: 'delete',
      input: { id: series.id },
    });
  });

  it('moves "All events" from a later occurrence onto the series’ first by the same amount', () => {
    // Thursday 9:00–10:00 dragged to 10:00–11:30
    const patch = {
      title: 'Sync',
      startAt: new Date(thursday.getTime() + H),
      endAt: new Date(thursday.getTime() + 2.5 * H),
    };
    expect(planEdit(expanded, 'all', patch)).toEqual({
      route: 'update',
      input: {
        id: series.id,
        title: 'Sync',
        startAt: new Date(series.startAt.getTime() + H),
        endAt: new Date(series.endAt.getTime() + 1.5 * H),
      },
    });
    // from a moved row the shift is from where it is now, and the series must be given
    expect(
      planEdit(
        { event: movedRow },
        'all',
        { startAt: new Date(movedRow.startAt.getTime() + H) },
        series,
      ),
    ).toEqual({
      route: 'update',
      input: {
        id: series.id,
        startAt: new Date(series.startAt.getTime() + H),
        endAt: series.endAt,
      },
    });
    expect(() => planEdit({ event: movedRow }, 'all', { title: 'Sync' })).toThrow();
  });

  it('moves an all-day series’ dates by the days the occurrence moved', () => {
    const allDay = event({
      id: id('evt_offsite'),
      allDay: true,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      startAt: new Date(2026, 9, 5),
      endAt: new Date(2026, 9, 6),
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
    });
    const target = { event: allDay, occurrenceStart: new Date(2026, 9, 12) };
    expect(
      planEdit(target, 'all', { allDay: true, startDate: '2026-10-14', endDate: '2026-10-15' }),
    ).toEqual({
      route: 'update',
      input: { id: allDay.id, allDay: true, startDate: '2026-10-07', endDate: '2026-10-08' },
    });
  });
});

describe('the repeat choices', () => {
  const monday = new Date(2026, 9, 5, 9);
  it('writes a rule per choice, a weekly one on the start’s weekday', () => {
    expect(repeatRule('none', monday)).toBeNull();
    expect(repeatRule('weekly', monday)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(repeatRule('weekdays', monday)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('reads a rule back as its choice, or custom', () => {
    expect(repeatPresetOf(null, monday)).toBe('none');
    expect(repeatPresetOf('RRULE:FREQ=DAILY', monday)).toBe('daily');
    expect(repeatPresetOf('RRULE:FREQ=WEEKLY;BYDAY=TH', monday)).toBe('weekly');
    expect(repeatPresetOf('RRULE:FREQ=WEEKLY;INTERVAL=2', monday)).toBe('custom');
  });
});
