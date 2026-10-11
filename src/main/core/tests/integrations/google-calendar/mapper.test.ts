import { describe, it, expect } from 'vitest';
import { EventKind, EventResponse, EventStatus } from '../../../events/types';
import {
  CalendarContext,
  NO_TITLE,
  descriptionToMarkdown,
  toCancelledInstance,
  toExternalEvent,
} from '../../../integrations/providers/google-calendar/mapper';
import {
  eventSchema,
  eventStubSchema,
} from '../../../integrations/providers/google-calendar/schema';
import timedFixture from '../fixtures/google-calendar/event-timed.json';
import allDayFixture from '../fixtures/google-calendar/event-all-day.json';
import masterFixture from '../fixtures/google-calendar/event-recurring-master.json';
import cancelledInstanceFixture from '../fixtures/google-calendar/event-cancelled-instance.json';
import modifiedInstanceFixture from '../fixtures/google-calendar/event-modified-instance.json';
import declinedFixture from '../fixtures/google-calendar/event-declined.json';
import meetFixture from '../fixtures/google-calendar/event-meet-link.json';
import cancelledFixture from '../fixtures/google-calendar/event-cancelled.json';

const CALENDAR: CalendarContext = {
  calendarId: 'ada@example.com',
  timeZone: 'America/New_York',
};

function map(fixture: unknown) {
  return toExternalEvent(eventSchema.parse(fixture), CALENDAR);
}

describe('Google Calendar mapper — toExternalEvent', () => {
  it('maps a timed event', () => {
    expect(map(timedFixture)).toEqual({
      externalId: 'ada@example.com:7cbh8rpc10lrc0ckih9tafss99',
      calendarId: 'ada@example.com',
      url: timedFixture.htmlLink,
      title: 'Design review',
      description:
        '**Agenda**  \nWalk through the [spec](https://docs.example.com/spec)\n\n-   Open questions\n-   Next steps\n\nBring notes',
      startAt: new Date('2026-10-12T14:00:00Z'),
      endAt: new Date('2026-10-12T15:00:00Z'),
      allDay: false,
      startDate: null,
      endDate: null,
      timeZone: 'America/New_York',
      location: 'Room 4',
      recurrenceRule: null,
      recurringEventExternalId: null,
      originalStartAt: null,
      meetingUrl: null,
      // colorId 11 from the event palette
      color: '#dc2127',
      status: EventStatus.CONFIRMED,
      // its own event, with no guests
      response: null,
      kind: EventKind.DEFAULT,
      cancelled: false,
      createdAt: new Date('2026-10-01T15:00:00Z'),
      updatedAt: new Date('2026-10-02T09:30:00Z'),
    });
  });

  it('maps an all-day event to its dates, with the exclusive end, and their local midnights', () => {
    const event = map(allDayFixture);
    expect(event.allDay).toBe(true);
    expect(event.startDate).toBe('2026-10-14');
    expect(event.endDate).toBe('2026-10-16');
    expect(event.startAt).toEqual(new Date(2026, 9, 14));
    expect(event.endAt).toEqual(new Date(2026, 9, 16));
    // no zone on the event: the calendar's
    expect(event.timeZone).toBe('America/New_York');
    // a plain-text description keeps its line breaks
    expect(event.description).toBe('Bring a laptop.\nLunch is provided.');
    // no colorId: none of its own, so it is drawn in its calendar's colour
    expect(event.color).toBeNull();
  });

  it('maps a recurring master with its rule lines and series zone', () => {
    const event = map({
      ...masterFixture,
      recurrence: [...masterFixture.recurrence, 'EXDATE;TZID=America/New_York:20261012T100000'],
    });
    expect(event.recurrenceRule).toBe(
      'RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO\nEXDATE;TZID=America/New_York:20261012T100000',
    );
    expect(event.timeZone).toBe('America/New_York');
    expect(event.recurringEventExternalId).toBeNull();
    expect(event.response).toBe(EventResponse.ACCEPTED);
  });

  it('maps a modified instance to its own event, pointing at its master', () => {
    const event = map(modifiedInstanceFixture);
    expect(event).toMatchObject({
      externalId: 'ada@example.com:4s2lfo5ma1k3a2rmq1hcf5c9fg_20261026T140000Z',
      title: 'Weekly sync (moved to Tuesday)',
      startAt: new Date('2026-10-27T14:00:00Z'),
      recurrenceRule: null,
      recurringEventExternalId: 'ada@example.com:4s2lfo5ma1k3a2rmq1hcf5c9fg',
      originalStartAt: new Date('2026-10-26T14:00:00Z'),
      cancelled: false,
    });
  });

  it('maps a cancelled instance to the occurrence it takes out', () => {
    const stub = eventStubSchema.parse(cancelledInstanceFixture);
    const event = toCancelledInstance(
      {
        ...stub,
        recurringEventId: stub.recurringEventId!,
        originalStartTime: stub.originalStartTime!,
      },
      CALENDAR,
    );
    expect(event).toMatchObject({
      externalId: 'ada@example.com:4s2lfo5ma1k3a2rmq1hcf5c9fg_20261019T140000Z',
      recurringEventExternalId: 'ada@example.com:4s2lfo5ma1k3a2rmq1hcf5c9fg',
      originalStartAt: new Date('2026-10-19T14:00:00Z'),
      allDay: false,
      cancelled: true,
    });
  });

  it('keeps a declined event, with the response', () => {
    const event = map(declinedFixture);
    expect(event.response).toBe(EventResponse.DECLINED);
    expect(event.title).toBe('Vendor demo');
    // a UTC time with no zone named: the calendar's zone
    expect(event.startAt).toEqual(new Date('2026-10-13T15:00:00Z'));
    expect(event.timeZone).toBe('America/New_York');
  });

  it('takes the Meet link as the meeting URL', () => {
    const event = map(meetFixture);
    expect(event.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(event.response).toBe(EventResponse.TENTATIVE);
  });

  it("takes another provider's video entry point when there is no Meet link", () => {
    const event = map({
      ...meetFixture,
      hangoutLink: undefined,
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1-555-0100' },
          { entryPointType: 'video', uri: 'https://zoom.example/j/123' },
        ],
      },
    });
    expect(event.meetingUrl).toBe('https://zoom.example/j/123');
  });

  it('maps the event type to a kind: focus time and out of office, the rest ordinary', () => {
    const kind = (eventType?: string) => map({ ...timedFixture, eventType }).kind;
    expect(kind('focusTime')).toBe(EventKind.FOCUS_TIME);
    expect(kind('outOfOffice')).toBe(EventKind.OUT_OF_OFFICE);
    expect(kind('fromGmail')).toBe(EventKind.DEFAULT);
    expect(kind(undefined)).toBe(EventKind.DEFAULT);
  });

  it('keeps a tentative event tentative', () => {
    expect(map({ ...timedFixture, status: 'tentative' }).status).toBe(EventStatus.TENTATIVE);
  });

  it('takes the creation time from created, or else updated', () => {
    expect(map({ ...timedFixture, created: undefined }).createdAt).toEqual(
      new Date('2026-10-02T09:30:00Z'),
    );
  });

  it('names an untitled event "(No title)"', () => {
    expect(map({ ...timedFixture, summary: undefined }).title).toBe(NO_TITLE);
    expect(map({ ...timedFixture, summary: '   ' }).title).toBe(NO_TITLE);
  });

  it('reads a cancelled event as a stub only: the full schema refuses it', () => {
    expect(eventStubSchema.safeParse(cancelledFixture).success).toBe(true);
    expect(eventSchema.safeParse(cancelledFixture).success).toBe(false);
  });

  it('refuses a time with both or neither of date and dateTime', () => {
    expect(
      eventSchema.safeParse({
        ...timedFixture,
        start: { date: '2026-10-12', dateTime: '2026-10-12T10:00:00Z' },
      }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...timedFixture, end: {} }).success).toBe(false);
  });
});

describe('Google Calendar mapper — descriptionToMarkdown', () => {
  it('converts the HTML Google Calendar writes', () => {
    expect(
      descriptionToMarkdown(
        '<h2>Plan</h2><p>See <i>this</i> &amp; <b>that</b></p><ol><li>One</li><li>Two</li></ol>',
      ),
    ).toBe('## Plan\n\nSee _this_ & **that**\n\n1.  One\n2.  Two');
  });

  it('strips what it cannot convert, keeping the text', () => {
    expect(
      descriptionToMarkdown(
        '<span style="x">kept</span><script>dropped()</script><style>p{}</style><u>under</u>',
      ),
    ).toBe('keptunder');
  });

  it('leaves plain text alone, line breaks included', () => {
    expect(descriptionToMarkdown('a < b\r\nc > d')).toBe('a < b\nc > d');
  });

  it('turns an empty description into null', () => {
    expect(descriptionToMarkdown('<br><br>')).toBeNull();
    expect(descriptionToMarkdown('  ')).toBeNull();
  });
});
