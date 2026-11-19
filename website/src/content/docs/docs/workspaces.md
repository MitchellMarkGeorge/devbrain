---
title: Workspaces
description: What a workspace is, switching between them, and moving one to another computer.
---

A **workspace** holds everything for one area of your work: its tasks, projects, notes, events and
connected accounts. Each is separate, so you might keep one for your job and one for side projects.
Nothing is shared between them, not even search.

## Switching, creating and opening

The workspace menu, at the top left of the window, lists your workspaces. Click one to switch to it:
DevBrain opens it on the page you last had open there. The menu also has:

- **New workspace…**: a name and a colour, then **Create Workspace**.
- **Open folder…**: add a workspace from a folder, such as one copied from another computer (also
  **File › Open Workspace Folder…**, <kbd>⌘O</kbd>).
- **Show in Finder**: show the workspace's folder in your file manager.

Rename a workspace or change its colour in [Settings › General](/docs/settings/#general), where you
can also delete it.

## A workspace is a folder

Each workspace is one folder inside DevBrain's folder (`.devbrain/workspaces/<id>/` in your home
folder):

| File               | What it holds                                                         |
| ------------------ | --------------------------------------------------------------------- |
| `db.sqlite`        | The workspace's database: tasks, projects, events, links, accounts, … |
| `db.sqlite-wal`    | Recent changes not yet folded into `db.sqlite`, while it's open       |
| `notes/`           | Your [notes](/docs/notes/#how-notes-are-stored), as Markdown files    |
| `workspace.json`   | Its name and colour, and the page you last had open                   |
| `db.sqlite.backup` | A copy of the database, made each time the workspace opens            |

[Data and privacy](/docs/data-and-privacy/) explains what's stored where, and how to back it up.

## Moving a workspace to another computer

1. On the old computer, quit DevBrain, so nothing is written while you copy.
2. Copy the workspace's whole folder to the new computer, including `db.sqlite-wal` if there is one:
   it can hold your latest changes. A USB drive, AirDrop or a synced folder all work.
3. On the new computer, choose **Open folder…** in the workspace menu (or **Open Existing Folder…**
   on the Welcome screen) and pick the copied folder: the one holding `db.sqlite`.
4. Reconnect your [integrations](/docs/integrations/#when-an-account-needs-reconnecting).

DevBrain copies the folder in and works on the copy, so the folder you picked is never changed and
can be deleted once the workspace opens. That also keeps a live database out of folders that a sync
tool such as Dropbox or iCloud is copying, which can corrupt it.

A workspace from an older DevBrain is updated when it opens. One last used by a newer DevBrain is
refused: update DevBrain first.

### Why you reconnect

Your integration sign-ins are encrypted with a key in your computer's own keychain, so another
computer can't read them. Your integrations, their settings and what they synced are all kept;
reconnect each from **Settings › Integrations** to carry on.

### If a folder is refused

| Message                                | What to do                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| This folder isn't a DevBrain workspace | Pick the workspace folder itself: the one holding `db.sqlite`.                    |
| …is already in your list               | It's already here: **Open It**. To replace it, delete the one in your list first. |
| DevBrain can't read this folder        | DevBrain doesn't have permission to read the folder or its files.                 |
| This workspace needs a newer DevBrain  | Update DevBrain on this computer.                                                 |
