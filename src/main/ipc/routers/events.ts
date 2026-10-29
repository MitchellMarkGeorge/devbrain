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
  // with its rule and exdates, for FullCalendar to expand
  listForCalendar: wsProcedure
    .input(
      z.object({
        start: z.date(),
        end: z.date(),
        // only these calendars, among the visible ones
        calendarIds: z.array(zId('calendar')).optional(),
      }),
    )
    .query(({ ctx, input: { start, end, ...options } }): Event[] =>
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
