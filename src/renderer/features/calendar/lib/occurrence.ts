import { DateTime } from 'luxon';
import type { EventId } from '@common/ids';
import type { Event } from '@common/types';
import type { ipc } from '@renderer/ipc';
import { canSplit } from './repeat';

// Which route an edit or delete of an event calls, per docs/calendar/fullcalendar-adapter.md,
// "Editing and deleting a recurring event": a one-off goes through `events.update`/`delete`; an
// occurrence of a series asks which occurrences it applies to, and each choice is one route.

export type OccurrenceScope = 'this' | 'following' | 'all';

/** The event the sheet shows, and for an expanded occurrence of a series its start (`occurrence`). */
export interface EventTarget {
  event: Event;
  occurrenceStart?: Date;
}

/** The fields an edit changes, as `events.update` takes them. */
export type EventPatch = Omit<Parameters<typeof ipc.events.update.mutate>[0], 'id'>;

/** An occurrence of a series: the series, its start in it, and where it is drawn now. */
export interface SeriesOccurrence {
  seriesId: EventId;
  /** the start it has in the series, matched exactly by core */
  originalStartAt: Date;
  /** where it is: the expanded start, or a moved occurrence row's own */
  start: Date;
  end: Date;
}

/**
 * The occurrence a target is, or null for a one-off. An expanded occurrence's series is the
 * master and its start the clicked one (the series' first when the URL named none); an occurrence
 * row names its series and original start itself, and is drawn at its own `startAt`.
 */
export function seriesOccurrenceOf({
  event,
  occurrenceStart,
}: EventTarget): SeriesOccurrence | null {
  if (event.seriesId && event.originalStartAt) {
    return {
      seriesId: event.seriesId,
      originalStartAt: event.originalStartAt,
      start: event.startAt,
      end: event.endAt,
    };
  }
  if (!event.recurrenceRule) return null;
  const start = occurrenceStart ?? event.startAt;
  return { seriesId: event.id, originalStartAt: start, start, end: occurrenceEnd(event, start) };
}

/** Where an occurrence of `series` starting at `start` ends: as long as the series' first. */
export function occurrenceEnd(series: Event, start: Date): Date {
  if (series.allDay && series.startDate && series.endDate) {
    const days = DateTime.fromISO(series.endDate).diff(
      DateTime.fromISO(series.startDate),
      'days',
    ).days;
    return DateTime.fromJSDate(start)
      .plus({ days: Math.max(1, Math.round(days)) })
      .toJSDate();
  }
  return new Date(start.getTime() + (series.endAt.getTime() - series.startAt.getTime()));
}

export interface ScopeChoice {
  scope: OccurrenceScope;
  /** why it can't apply to this change, or undefined when it can */
  unavailable?: string;
}

/**
 * The choices an edit of an occurrence offers. "This event" stays on the series' calendar with no
 * rule of its own, so it can't change either; "This and following" can't split a rule with
 * `RDATE`, `EXRULE` or several `RRULE`s (`seriesRule` is the series' own rule).
 */
export function editScopes(patch: EventPatch, seriesRule: string | null): ScopeChoice[] {
  const ownRule = patch.calendarId !== undefined || patch.recurrenceRule !== undefined;
  return [
    {
      scope: 'this',
      unavailable: ownRule
        ? 'One event of a series stays on its calendar and repeats with it.'
        : undefined,
    },
    {
      scope: 'following',
      unavailable: canSplit(seriesRule) ? undefined : 'This series can’t be split.',
    },
    { scope: 'all' },
  ];
}

/** The choices a delete of an occurrence offers. */
export function deleteScopes(seriesRule: string | null): ScopeChoice[] {
  return [
    { scope: 'this' },
    {
      scope: 'following',
      unavailable: canSplit(seriesRule) ? undefined : 'This series can’t be split.',
    },
    { scope: 'all' },
  ];
}

export type EditCall =
  | { route: 'update'; input: Parameters<typeof ipc.events.update.mutate>[0] }
  | { route: 'updateOccurrence'; input: Parameters<typeof ipc.events.updateOccurrence.mutate>[0] };

export type DeleteCall =
  | { route: 'delete'; input: Parameters<typeof ipc.events.delete.mutate>[0] }
  | { route: 'deleteOccurrence'; input: Parameters<typeof ipc.events.deleteOccurrence.mutate>[0] };

/**
 * The call an edit makes. `series` is the series' master, needed for "All events" from an
 * occurrence: core takes a series' timing as its first occurrence's, so a time change made on
 * another occurrence is moved onto the master by the same amount (the adapter spec's "All events
 * from a later occurrence").
 */
export function planEdit(
  target: EventTarget,
  scope: OccurrenceScope,
  patch: EventPatch,
  series?: Event,
): EditCall {
  const occurrence = seriesOccurrenceOf(target);
  if (!occurrence) return { route: 'update', input: { id: target.event.id, ...patch } };
  if (scope !== 'all') {
    return {
      route: 'updateOccurrence',
      input: {
        seriesId: occurrence.seriesId,
        originalStartAt: occurrence.originalStartAt,
        scope,
        ...patch,
      },
    };
  }
  const master = series ?? target.event;
  if (master.id !== occurrence.seriesId) {
    throw new Error(`The series of ${target.event.id} is ${occurrence.seriesId}, not ${master.id}`);
  }
  return { route: 'update', input: { id: master.id, ...onSeries(patch, occurrence, master) } };
}

/** The call a delete makes. */
export function planDelete(target: EventTarget, scope: OccurrenceScope): DeleteCall {
  const occurrence = seriesOccurrenceOf(target);
  if (!occurrence) return { route: 'delete', input: { id: target.event.id } };
  if (scope === 'all') return { route: 'delete', input: { id: occurrence.seriesId } };
  return {
    route: 'deleteOccurrence',
    input: { seriesId: occurrence.seriesId, originalStartAt: occurrence.originalStartAt, scope },
  };
}

// a patch made on one occurrence, as the same change to the series: timing moved by the amount the
// occurrence's moved, everything else as it is
function onSeries(patch: EventPatch, occurrence: SeriesOccurrence, master: Event): EventPatch {
  const { startAt, endAt, startDate, endDate, ...rest } = patch;
  const out: EventPatch = { ...rest };
  if (startAt !== undefined || endAt !== undefined) {
    const startShift = (startAt ?? occurrence.start).getTime() - occurrence.start.getTime();
    const endShift = (endAt ?? occurrence.end).getTime() - occurrence.end.getTime();
    out.startAt = new Date(master.startAt.getTime() + startShift);
    out.endAt = new Date(master.endAt.getTime() + endShift);
  }
  if (startDate !== undefined || endDate !== undefined) {
    const from = DateTime.fromJSDate(occurrence.start).startOf('day');
    const to = DateTime.fromJSDate(occurrence.end).startOf('day');
    const masterStart = master.startDate ?? DateTime.fromJSDate(master.startAt).toISODate()!;
    const masterEnd = master.endDate ?? DateTime.fromJSDate(master.endAt).toISODate()!;
    const shift = (date: string | undefined, base: DateTime, onto: string) =>
      date === undefined
        ? onto
        : DateTime.fromISO(onto)
            .plus({ days: Math.round(DateTime.fromISO(date).diff(base, 'days').days) })
            .toISODate()!;
    out.startDate = shift(startDate, from, masterStart);
    out.endDate = shift(endDate, to, masterEnd);
  }
  return out;
}
