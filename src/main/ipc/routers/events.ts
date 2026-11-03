import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import { safeUrlSchema } from '@common/safe-url';
import { timeZoneSchema } from '@main/core/shared/dates';
import { EventKind, EventStatus, type Event } from '@main/core/events/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// The calendar's events. Events on a synced calendar are read-only: writes to them, or creating one
// there, fail with external_read_only.

const byId = z.object({ id: zId('event') });

// An occurrence of a series by its start in the series: an expanded occurrence's start, or a
// moved or edited occurrence's originalStartAt.
const occurrence = z.object({
  seriesId: zId('event'),
  originalStartAt: z.date(),
  scope: z.enum(['this', 'following']),
});

// what create and update share; an all-day event's dates are YYYY-MM-DD, the end exclusive
const fields = {
  description: z.string().optional(),
  calendarId: zId('calendar').optional(),
  allDay: z.boolean().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  timeZone: timeZoneSchema.optional(),
  location: z.string().optional(),
  status: z.enum(EventStatus).optional(),
  kind: z.enum(EventKind).optional(),
  meetingUrl: safeUrlSchema.optional(),
};

export const eventsRouter = t.router({
  // every event of the visible calendars that may occur in [start, end], unpaged: a series once,
  // with its rule and exdates, for FullCalendar to expand. A range before what synced calendars
  // mirror has its older events fetched from their sources first (see listForCalendar)
  listForCalendar: wsProcedure
    .input(
      z.object({
        start: z.date(),
        end: z.date(),
        // only these calendars, among the visible ones
        calendarIds: z.array(zId('calendar')).optional(),
      }),
    )
    .query(
      ({ ctx, input: { start, end, ...options } }): Promise<Event[]> =>
        ctx.workspace.events.listForCalendar(start, end, options),
    ),

  get: wsProcedure
    .input(byId)
    .query(({ ctx, input }): Event => ctx.workspace.events.getById(input.id)),

  // on the default local calendar when no calendarId is given
  create: wsProcedure
    .input(
      z.object({
        ...fields,
        title: z.string(),
        startAt: z.date(),
        endAt: z.date(),
        recurrenceRule: z.string().optional(),
        color: hexColorSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }): Event => ctx.workspace.events.createEvent(input)),

  // a null recurrenceRule makes a series a one-off; a null color falls back to the calendar's
  update: wsProcedure
    .input(
      byId.extend({
        ...fields,
        title: z.string().optional(),
        startAt: z.date().optional(),
        endAt: z.date().optional(),
        recurrenceRule: z.string().nullable().optional(),
        color: hexColorSchema.nullable().optional(),
      }),
    )
    .mutation(
      ({ ctx, input: { id, ...updates } }): Event => ctx.workspace.events.updateEvent(id, updates),
    ),

  // a hard delete; a series takes its moved and edited occurrences with it
  delete: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }): void => ctx.workspace.events.deleteEvent(input.id)),

  // One occurrence of a series ("this") or it and every later one ("following"); the whole series
  // goes through update. Returns the occurrence's own row for "this", and the series starting at the
  // occurrence for "following". "this" refuses a calendarId or recurrenceRule.
  updateOccurrence: wsProcedure
    .input(
      occurrence.extend({
        ...fields,
        title: z.string().optional(),
        startAt: z.date().optional(),
        endAt: z.date().optional(),
        recurrenceRule: z.string().nullable().optional(),
        color: hexColorSchema.nullable().optional(),
      }),
    )
    .mutation(
      ({ ctx, input: { seriesId, originalStartAt, scope, ...updates } }): Event =>
        ctx.workspace.events.updateOccurrence({ seriesId, originalStartAt }, scope, updates),
    ),

  // "this" cancels the occurrence; "following" ends the series before it. The whole series goes
  // through delete.
  deleteOccurrence: wsProcedure
    .input(occurrence)
    .mutation(({ ctx, input: { scope, ...ref } }): void =>
      ctx.workspace.events.deleteOccurrence(ref, scope),
    ),

  // the state wanted, not a toggle: a repeat changes nothing. A synced event can be favorited.
  setFavorite: wsProcedure
    .input(byId.extend({ favorite: z.boolean() }))
    .mutation(
      ({ ctx, input }): Event =>
        input.favorite
          ? ctx.workspace.favorites.favoriteEvent(input.id)
          : ctx.workspace.favorites.unfavoriteEvent(input.id),
    ),
});
