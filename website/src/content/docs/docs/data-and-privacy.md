---
title: Data and privacy
description: Where DevBrain keeps your data, what goes over the network, how sign-ins are protected, and how to back up.
---

DevBrain is **local first**: your work is stored on your computer, in files you can see, copy and
back up, and the app works the same with or without the internet. There's no DevBrain account, no
DevBrain server, and nothing to sign up for.

## Where your data lives

Everything is in one folder, `.devbrain` in your home folder (`~/.devbrain` on macOS and Linux,
`C:\Users\<you>\.devbrain` on Windows):

| Path              | What it holds                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| `settings.json`   | The settings under **All workspaces**, and which workspace you had open  |
| `workspaces.json` | Your list of workspaces (with a `.bak` copy DevBrain keeps)              |
| `workspaces/`     | A folder for each [workspace](/docs/workspaces/#a-workspace-is-a-folder) |

Inside a workspace's folder, `db.sqlite` is an SQLite database holding your tasks, projects, events,
links and connected accounts, and `notes/` holds each note as a Markdown file.

**Settings › Data & storage › Data folder** shows the folder, as does **Workspace › Show DevBrain
Folder** in the menu bar. Uninstalling DevBrain leaves it in place.

## What goes over the network

DevBrain only connects to the internet for the [integrations](/docs/integrations/) you turn on:

- **Linear**, at `api.linear.app`, with your API key.
- **Google**, to sign you in and read your calendars, with read-only access.

That's all. There's no analytics or crash reporting, and DevBrain doesn't check for updates by
itself. Requests use your system's proxy settings and certificates.

Synced content is treated with care: images in Linear descriptions and Google events are never
loaded (they show as links), and links open in your browser, never inside DevBrain.

## How sign-ins are protected

Your Linear API key and Google sign-in are encrypted with a key kept in your operating system's
keychain (the Keychain on macOS, Windows' data protection, or the Secret Service on Linux), and the
encrypted copy is stored in the workspace's database. They're only ever sent to Linear or Google,
and never shown again in the app.

That's why a workspace moved to another computer
[needs its accounts reconnected](/docs/integrations/#when-an-account-needs-reconnecting): only the
computer that encrypted them can read them. On a Linux system with no keychain service, DevBrain
falls back to a fixed key, and accounts don't need reconnecting.

Disconnecting an account deletes its key or sign-in, and asks Linear or Google to revoke it.

## Backing up

DevBrain doesn't back your workspaces up for you. To make a backup:

1. Quit DevBrain.
2. Copy the workspace's folder (or the whole `.devbrain` folder) somewhere safe, including any
   `db.sqlite-wal` file.

To restore one, [open the copied folder](/docs/workspaces/#moving-a-workspace-to-another-computer)
in DevBrain. For copies that other apps can read, [export](/docs/import-export/) your tasks as CSV
or JSON and your notes as Markdown.

:::caution
Don't keep the `.devbrain` folder itself inside Dropbox, iCloud Drive or a similar synced folder: a
sync tool copying the database while DevBrain writes to it can corrupt it. Copy a backup there
instead.
:::

Each time a workspace opens, DevBrain copies its database to `db.sqlite.backup`. It's there so
DevBrain can put the workspace back as it was if updating it for a new version fails, not as a
backup to restore by hand.
