---
title: Workspaces
description: What a workspace is, and how to move one to another computer.
---

A **workspace** holds everything for one area of your work: its tasks, projects, notes, events and
connected accounts. Each is separate, so you might keep one for your job and one for side projects.
Switch between them, create one or open one from a folder in the workspace menu at the top of the
sidebar.

## A workspace is a folder

Each workspace is one folder inside DevBrain's folder (`~/.devbrain/workspaces/<id>/`):

| File             | What it holds                                        |
| ---------------- | ---------------------------------------------------- |
| `db.sqlite`      | The workspace's database: tasks, projects, events, … |
| `notes/`         | Your notes, as Markdown files                        |
| `workspace.json` | Its name and colour, and the page you last had open  |

## Moving a workspace to another computer

1. On the old computer, quit DevBrain, so nothing is written while you copy.
2. Copy the workspace's whole folder to the new computer, including `db.sqlite-wal` if there is one:
   it can hold your latest changes. A USB drive, AirDrop or a synced folder all work.
3. On the new computer, choose **Open folder…** in the workspace menu and pick the copied folder
   (the one holding `db.sqlite`).
4. Sign in to your [integrations](/docs/integrations/) again.

DevBrain copies the folder in and works on the copy, so the folder you picked is never changed and
can be deleted once the workspace opens. That also keeps a live database out of folders that a sync
tool such as Dropbox or iCloud is copying, which can corrupt it.

### Why you sign in again

Your integration sign-ins are encrypted with a key in your computer's own keychain, so another
computer can't read them. Your integrations, their settings and what they synced are all kept;
reconnect each from **Settings › Integrations** to carry on.

### If a folder is refused

| Message                       | What to do                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| isn't a DevBrain workspace    | Pick the workspace folder itself: the one holding `db.sqlite`.                      |
| already in your list          | It's already here: open it from the workspace menu. To replace it, delete it first. |
| doesn't have permission       | DevBrain can't read the folder or its files.                                        |
| last used by a newer DevBrain | Update DevBrain on this computer.                                                   |
