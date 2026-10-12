import { ExternalCalendar, ExternalEvent } from '../../types';
import { Auth } from '../../auth';
import { CalendarEventPage, CalendarSource, EventsQuery, RequestOptions } from '../provider';
import { GoogleCalendarClient } from './client';
import { CalendarContext, externalEventId, toCancelledInstance, toExternalEvent } from './mapper';
import { EventsWindow } from './requests';
import { CANCELLED_STATUS, eventSchema, eventStubSchema } from './schema';

/**
 * The account's Google calendars as a calendar source: the calendar list, and one events.list page
 * of one calendar per call. Which calendars a sync visits, in what order, and where each one
 * resumes is EventSyncer's.
 *
 * - A full pass asks for everything from `from` on (timeMin); a change walk sends Google's sync
 *   token, our change token, alone. The other parameters are fixed in ./requests, as Google wants
 *   them to match across the pages of a pass and between the pass that issued a token and the
 *   walks that use it.
 * - Google sends nextPageToken on every page of a pass but the last, and nextSyncToken on the last
 *   only, which become nextPageToken and changeToken.
 * - A 410 means Google no longer accepts the sync token (or page token); the client throws
 *   ChangeTokenExpiredError for it.
 */
export class GoogleCalendarSource implements CalendarSource {
  constructor(private readonly client: GoogleCalendarClient) {}

  // The account's calendars as Google lists them (calendarList): the client pages through the list
  // and maps each entry
  listCalendars(auth: Auth, options: RequestOptions = {}): Promise<ExternalCalendar[]> {
    return this.client.listExternalCalendars(auth, options);
  }

  async getEventPage(
    auth: Auth,
    calendarId: string,
    query: EventsQuery,
    options: RequestOptions = {},
  ): Promise<CalendarEventPage> {
    const window: EventsWindow =
      'changeToken' in query ? { syncToken: query.changeToken } : { timeMin: query.from };
    const response = await this.client.listEvents(
      auth,
      calendarId,
      window,
      query.pageToken ?? null,
      options,
    );
    // an event that names no zone of its own is in its calendar's, which the response carries
    const page = mapEvents(response.items, {
      calendarId,
      timeZone: response.timeZone ?? null,
    });
    return {
      ...page,
      nextPageToken: response.nextPageToken ?? null,
      changeToken: response.nextSyncToken ?? null,
    };
  }
}

interface MappedEvents {
  events: ExternalEvent[];
  cancelledIds: string[];
  skipped: number;
}

// validates and maps entries one by one, so a bad entry is skipped instead of failing the page
function mapEvents(items: unknown[], calendar: CalendarContext): MappedEvents {
  const result: MappedEvents = { events: [], cancelledIds: [], skipped: 0 };

  for (const item of items) {
    const stub = eventStubSchema.safeParse(item);
    if (!stub.success) {
      result.skipped++;
      continue;
    }

    if (stub.data.status === CANCELLED_STATUS) {
      const { recurringEventId, originalStartTime } = stub.data;
      if (recurringEventId && originalStartTime) {
        // one occurrence of a series: it comes out of the master
        result.events.push(
          toCancelledInstance({ ...stub.data, recurringEventId, originalStartTime }, calendar),
        );
      } else {
        // a whole event or series
        result.cancelledIds.push(externalEventId(calendar.calendarId, stub.data.id));
      }
      continue;
    }

    const event = eventSchema.safeParse(item);
    if (!event.success) {
      result.skipped++;
      continue;
    }
    result.events.push(toExternalEvent(event.data, calendar));
  }
  return result;
}
