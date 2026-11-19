---
title: Google Calendar
description: Show the events of the Google calendars you choose in DevBrain's calendar.
---

Connect Google Calendar, and the events of the calendars you choose appear in DevBrain's
[calendar](/docs/calendar/) beside your own, ready for meeting notes and follow-up tasks. DevBrain
asks Google for **read-only** access: it can't change your calendars, and nothing you do in
DevBrain is sent to Google. See [how sync works](/docs/integrations/#how-sync-works).

## Connecting

1. In DevBrain, open **Settings › Integrations** and choose **Connect** next to Google Calendar (or
   **Connect Account › Google Calendar** when an account is already connected).
2. Google's sign-in page opens in your **web browser**, and DevBrain shows "Finish signing in in
   your browser…".
3. Sign in, and allow DevBrain to see your calendars and their events.
4. The browser tab says "You're signed in", and you can close it. Back in DevBrain, the account is
   connected and the first sync starts.

If you don't finish within five minutes, or choose **Cancel**, nothing is connected; try again
when you're ready. You can connect several Google accounts, such as a work one and a personal one.

The sign-in is stored encrypted with your computer's keychain. DevBrain signs in through your own
browser, so it never sees your Google password.

## Choosing calendars

At first, only your **primary** calendar syncs. To add others:

1. On the account's **Events** row, choose **Choose Calendars**.
2. Tick the calendars to bring into DevBrain. Each change saves at once and starts a sync.
3. Choose **Done**.

The row then says how many are synced, such as "3 of 7 calendars". Calendars you leave unticked, and
any new ones added to your Google account later, stay in Google until you tick them. Unticking a
calendar removes its events from DevBrain at the next sync.

To hide a synced calendar for a while without unticking it, use the calendar page's
[Filter](/docs/calendar/#which-calendars-show).

## What comes in

- Events from **30 days ago onward**, with no limit into the future. Earlier events load when you go
  back to them in the calendar.
- Regular events, **focus time**, **out of office**, and events Gmail adds. Working-location and
  birthday events are left out.
- Each event's title, times, repeat, location, meeting link and description, in its calendar's
  colour.
- Your **response**: events you've declined are shown faded, and ones you answered "maybe" have a
  dashed edge.

## What you can do with them in DevBrain

Google events are read-only, with a **Google Calendar** badge. Their sheet shows your **Response**
(Going, Maybe, Not going or Not answered); change it, or the event, in Google Calendar (**Open in
Google Calendar**). You can't delete them in DevBrain.

You can still:

- start a [meeting note](/docs/calendar/#meeting-notes), and link tasks to the event;
- join the meeting from its **Join** button, and find the event in [search](/docs/search/).

If a meeting you've written a note for or linked a task to is cancelled in Google, DevBrain keeps it
hidden from the calendar, so the note and the tasks keep their link.

## Reconnecting

If the sign-in stops working (you removed DevBrain's access in your Google account, for example),
the account shows **Needs reconnect** and "Paused until you reconnect". Its events stay in the
calendar. Choose **Reconnect** and sign in again in your browser.

You also need to do this after [moving the workspace to another computer](/docs/workspaces/#moving-a-workspace-to-another-computer).

## Disconnecting

**Disconnect…** on the account removes its sign-in from your computer, asks Google to revoke
DevBrain's access, and asks what to do with its events: **Keep as local copies** or **Remove
them**. Calendars whose events are kept become local calendars. See
[Disconnecting](/docs/integrations/#disconnecting).
