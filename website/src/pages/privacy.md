---
layout: ../components/LegalPage.astro
title: Privacy policy
description: What DevBrain and this website do with your information, which is very little.
updated: November 19, 2026
---

> **In short:** DevBrain runs on your computer and keeps your work there. There is no DevBrain
> account and no DevBrain server, and the app sends us nothing: no analytics, no usage data, no crash
> reports. When you connect Linear or Google Calendar, the app talks to them directly from your
> computer, and what it reads stays on your computer.

This policy covers the DevBrain desktop app and this website, devbrainapp.dev. DevBrain is made
by Mitchell Mark-George ("we", "us"). Questions about it go to
[mitchellmmarkgeorge@gmail.com](mailto:mitchellmmarkgeorge@gmail.com).

## The DevBrain app

### What you create stays on your computer

Your workspaces (tasks, projects, notes, events and settings) are stored in a folder on your
computer: `.devbrain` in your home folder. Each workspace is a database file and your notes as
Markdown files. We never receive any of it, and the app has no way to send it to us.

The app also writes a log file in your system's usual logs folder, to help you diagnose problems.
It stays on your computer unless you choose to send it to someone.

### What the app doesn't do

- It has no account and no sign-up.
- It sends no analytics, telemetry, usage statistics or crash reports.
- It doesn't check for updates in the background or contact any DevBrain server: there isn't one.
- It doesn't load images or other content from the internet inside your notes or synced items, so
  nobody learns when you read them. Links open in your browser when you click them.

### Linear

If you connect Linear, you give the app a Linear personal API key. The app:

- stores the key on your computer, encrypted with your operating system's keychain;
- sends requests directly from your computer to Linear's API (`api.linear.app`) to read the issues
  assigned to you, with their projects and sub-issues, and keeps copies of them in your workspace;
- stores your Linear name and organisation's name on your computer, to label the connection.

Nothing is sent back to Linear except those requests, and nothing is sent to us. Linear's own
[privacy policy](https://linear.app/privacy) covers what Linear does with your data.

### Google Calendar

If you connect Google Calendar, you sign in with Google in your browser and allow DevBrain access.
The app asks for the least access it needs:

| Permission                                                        | Why                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `openid`                                                          | To recognise the same Google account if you connect it again. It gives no profile information. |
| See the list of your calendars (`calendar.calendarlist.readonly`) | So you can choose which calendars to show.                                                     |
| See the events on your calendars (`calendar.events.readonly`)     | To show the events of the calendars you chose.                                                 |

With that access, the app:

- reads the list of your calendars and the events on the ones you choose, directly from Google's
  servers to your computer, and keeps copies of them in your workspace. It can't create, change or
  delete anything in your Google account;
- stores your Google account's email address on your computer, to label the connection;
- stores the access it was given (OAuth tokens) on your computer, encrypted with your operating
  system's keychain;
- asks Google to revoke its access when you disconnect Google Calendar in DevBrain.

The information DevBrain receives from Google is used only to show your calendars and events to
you in the app. It is never sent to us or to anyone else, never sold, never used for advertising,
and never read by a person other than you.

DevBrain's use and transfer of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

You can also remove DevBrain's access at any time from your
[Google Account's third-party connections](https://myaccount.google.com/connections).

## This website

- **Hosting.** This website is hosted by Cloudflare. To deliver and protect it, Cloudflare processes
  the technical details of each request, such as your IP address and browser, under
  [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). We don't receive
  identifying information about visitors.
- **No cookies, analytics or tracking.** The site sets no cookies and has no analytics, tracking
  pixels or advertising. Its fonts are served from the site itself.
- **Your theme in the docs.** If you choose a light or dark theme in the docs, your browser
  remembers the choice in its local storage, on your device only.
- **Downloads.** The installers are downloaded from GitHub, under
  [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

## If you contact us

If you email us, we use your email address and what you write only to reply to you, and keep it
no longer than we need to.

## Your choices

Because your data is on your computer, you're in control of it:

- delete a workspace in DevBrain, or delete its folder, to remove its data;
- disconnect Linear or Google Calendar in the workspace's settings, which removes the stored
  credentials, and choose whether to keep or delete what they brought in;
- revoke a Linear API key in Linear's settings, or DevBrain's Google access in your Google Account.

For anything about the information we hold (only the emails you send us), contact us at the address
above.

## Children

DevBrain isn't directed at children under 13, and we don't knowingly collect their information.

## Changes to this policy

If DevBrain starts handling your information differently, we'll update this page and the date at
the top before the change takes effect.

## Contact

Mitchell Mark-George · [mitchellmmarkgeorge@gmail.com](mailto:mitchellmmarkgeorge@gmail.com)
