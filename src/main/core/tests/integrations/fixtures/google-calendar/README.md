# Google Calendar fixtures

Every fixture here is **hand-written**, from the request shapes in the design's provider reference ("Provider reference" → Google Calendar) and memory of the Calendar API v3 resources. None was recorded: there was no Google account or network access when they were written. Names, emails, ids and links are made up.

| File                            | What it is                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `calendar-list.json`            | Response to `GET users/me/calendarList`: the primary calendar, a shared one with a user-given name, a holiday calendar |
| `primary-calendar.json`         | Response to `GET users/me/calendarList/primary`                                                                        |
| `userinfo.json`                 | Response to the OpenID Connect userinfo endpoint for a token granted `openid` only                                     |
| `events-page.json`              | The wrapper of an `events.list` response, with no items; tests fill in items and a page or sync token                  |
| `event-timed.json`              | A timed event with an HTML description, a location and an event colour                                                 |
| `event-all-day.json`            | A two-day all-day event, with a plain-text description                                                                 |
| `event-recurring-master.json`   | A weekly series master with its `recurrence` lines and attendees                                                       |
| `event-cancelled-instance.json` | One cancelled occurrence of that series, as the minimal entry Google sends                                             |
| `event-modified-instance.json`  | One moved occurrence of that series, with `recurringEventId` and `originalStartTime`                                   |
| `event-declined.json`           | An invitation the account declined                                                                                     |
| `event-meet-link.json`          | An event with a Meet link and conference entry points, which the account answered "maybe" to                           |
| `event-cancelled.json`          | A cancelled (deleted) event, as the minimal entry Google sends                                                         |
| `error-sync-token-expired.json` | Body of the 410 sent when a sync token is no longer valid                                                              |
| `error-rate-limited.json`       | Body of a 403 rate limit                                                                                               |
| `error-forbidden.json`          | Body of a 403 that is not a rate limit                                                                                 |

## Where the field names live

Every field name, value and parameter is in one place under `src/main/core/integrations/providers/google-calendar/`, so a correction is a change there and to these fixtures: query parameters and URLs in `requests.ts`, response shapes and values (the cancelled marker, the video entry point, rate-limit reasons, the event colour palette) in `schema.ts`, the OAuth endpoints and scopes in `index.ts`.

## Confirmed against Google's reference

Checked on 9 October 2026 against the Calendar API v3 reference pages for [`events.list`](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [`events.instances`](https://developers.google.com/workspace/calendar/api/v3/reference/events/instances) and the [event resource](https://developers.google.com/workspace/calendar/api/v3/reference/events). The fixtures still are not recorded responses, but their shapes match these pages.

- **The cancelled marker.** `status: "cancelled"` means one of two things:
  - A cancelled exception of a series that is still running: only `id`, `recurringEventId` and `originalStartTime` are guaranteed. Google asks clients to keep these for the lifetime of the series, which `external_event_exceptions` does.
  - Any other cancelled event is a deletion, and only `id` is guaranteed.

  On the organizer's calendar a deleted event may still carry its details. The source reads every cancelled entry with the minimal stub schema, so both cases work.

- **Instances.** `recurringEventId` is the master's `id`. `originalStartTime` uses `date` or `dateTime` as `start` does, and identifies an occurrence even after it was moved.
- **`recurrence`** holds RRULE, EXRULE, RDATE and EXDATE lines, never DTSTART or DTEND. It is set on masters only.
- **`start.timeZone`** is required on a recurring event and is the zone the recurrence expands in: the series zone kept in link metadata. `end` is exclusive, so an all-day event's `end.date` is the day after it ends.
- **`description`** can contain HTML. Event `id`s use base32hex (`a-v`, `0-9`), so they never contain the `:` that joins calendar and event ids.
- **Attendees.**
  - `responseStatus` is one of `needsAction`, `declined`, `tentative` or `accepted`.
  - `self` marks the attendee entry of the calendar this copy of the event is on: the account itself on its primary calendar, the shared calendar on any other.
- **Meeting links.** There is a `hangoutLink`, and at most one `conferenceData.entryPoints[]` entry of type `video`, with an http(s) URI.
- **`eventType`** is one of `default`, `birthday`, `focusTime`, `fromGmail`, `outOfOffice` or `workingLocation`. The `eventTypes` request filter takes the same values, and with it unset Google returns every type. The source asks for `default`, `focusTime`, `outOfOffice` and `fromGmail`.
- **The request.** `singleEvents`, `showDeleted`, `maxResults` (default 250, at most 2500), `timeMin`, `syncToken` and `pageToken` are all valid parameters.
  - `syncToken` cannot be combined with `timeMin`, `timeMax`, `updatedMin`, `orderBy`, `q`, `iCalUID` or the extended-property filters.
  - Every other parameter must stay the same as on the pass that issued the token.
  - `showDeleted` must not be false alongside a sync token.
- **`timeMin`** on `events.list` is an _exclusive_ lower bound on an event's end time. On `events.instances` it is inclusive. Milliseconds are ignored.
- **Paging.**
  - `nextPageToken` comes on every page but the last, and `nextSyncToken` on the last only, including after a full pass restricted by `timeMin`.
  - A page may hold fewer items than `maxResults`, even none, while more remain. The source decides that a pass ended by `nextPageToken` alone.
- **An expired sync token** is a 410 with reason `fullSyncRequired` (domain `calendar`). The client clears its state for that calendar and does a full sync. A 410 also answers `updatedMin` too far back and deleting an already deleted event; the source sends neither.
- **Errors** carry `error.code`, `error.message` and `error.errors[]` with `domain`, `reason` and `message` (from the API's errors guide).
  - A rate limit is reason `rateLimitExceeded`, as a 403 or a 429 (the two are handled the same), or `userRateLimitExceeded` as a 403. Google's advice is exponential backoff.
  - A rate limit may or may not carry `Retry-After`. The client waits that many seconds when it does, and `BACKOFF_INITIAL_MS` when it does not.
  - A 401 (`authError`) means the access token is expired or invalid: refresh it, and if that fails, reconnect.
  - A 403 `quotaExceeded` ("Calendar usage limits exceeded") is an abuse limit, not a rate limit; it is handled as a plain API error.
  - A 404 (`notFound`) answers a calendar the account can no longer read. A 500 (`backendError`) is retried with backoff.
- **The response's top-level `timeZone`** is the calendar's zone, used when an event names none.
- **`updated`** does not change when reminders change, which DevBrain does not mirror.

## From memory, to confirm

- Whether these scopes are classed as sensitive and so need app verification, and whether refresh tokens expire after 7 days while the consent screen is in testing status.
- Whether `updated` changes when the user answers an invitation. If it does not, a changed `response` would be skipped by the unchanged check.
- That a 410 can also answer an expired page token. The source treats any 410 as "walk this calendar again".
- The event colour palette for `colorId` 1–11, from the colors endpoint. Note that `eventLabelId`, which supersedes `colorId`, is not read yet; see the follow-ups doc.
- That the userinfo endpoint (`https://openidconnect.googleapis.com/v1/userinfo`) answers a token granted `openid` alone with `sub` and no other claims, and answers a token without `openid` with a 401. The account id is that `sub`.
- That `calendarList/primary` returns the account's email as `id`. It is used as the account's label, since no `email` claim is requested.
- That HTML descriptions use `<b>`, `<i>`, `<u>`, `<br>`, `<a>` and `<ul>`/`<ol>`, and that API-written descriptions are plain text with newlines.

## Still to check on a live account

The "Done when" check for feature 16b is for the maintainer: connect a real calendar and confirm it mirrors correctly, including one weekly series with a moved and a cancelled occurrence. Recording real responses into this folder at the same time would replace the hand-written fixtures and settle what is left above.
