---
title: Troubleshooting and FAQ
description: 'Fix problems with DevBrain: where its log file is, what each error screen means, the Linux AppImage sandbox, and answers to common questions.'
---

## The log file

DevBrain writes what it does, and any errors, to a log file. **Help › Show Log File** in the menu
bar shows it in your file manager. It's `main.log`, in:

| System  | Folder                    |
| ------- | ------------------------- |
| macOS   | `~/Library/Logs/DevBrain` |
| Windows | `%APPDATA%\DevBrain\logs` |
| Linux   | `~/.config/DevBrain/logs` |

When it reaches 5 MB, it's renamed `main.old.log` and a new one starts. Attach both to a
[bug report](https://github.com/MitchellMarkGeorge/devbrain/issues).

## Error screens

| What you see                           | What to do                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| DevBrain couldn't open its data folder | Check that `.devbrain` in your home folder is there and you can read it, then quit and reopen DevBrain. |
| Can't find _workspace_'s folder        | The workspace's folder was moved, renamed or deleted. Put it back where it was.                         |
| _Workspace_ needs a newer DevBrain     | It was last opened by a newer version. Update DevBrain.                                                 |
| _Workspace_ couldn't be updated        | Updating its data for this version failed, and it was left as it was. Send the log file.                |
| Something went wrong                   | Choose **Reload**. If it keeps happening, send the log file.                                            |

## Linux: the AppImage and the sandbox

On Ubuntu 24.04 and later, and other systems that restrict unprivileged user namespaces, Chromium's
sandbox can't start, so DevBrain starts without the operating system's sandbox around its window.
The app's own protections (no Node.js in the page, strict isolation, a strict content policy) still
apply.

If the AppImage doesn't start at all, make sure it's executable (`chmod +x`), then run it from a
terminal to see why.

## Questions

### Does DevBrain work offline?

Yes. Everything but syncing works without a connection; the sidebar says **Offline**, and sync
catches up when you're back.

### Can I use DevBrain on two computers?

Not at the same time on the same workspace: there's no DevBrain server to keep them in step. You can
[move a workspace](/docs/workspaces/#moving-a-workspace-to-another-computer) from one computer to
the other.

### Can I keep my workspace in Dropbox or iCloud?

Not while DevBrain uses it: a sync tool copying the database as it's written can corrupt it. Keep
[backups](/docs/data-and-privacy/#backing-up) there instead.

### Why can't I edit a task?

It's synced from Linear (it has a key such as **ENG-124**). Change it there, or [detach it](/docs/tasks/#tasks-from-linear).

### Why doesn't my change show in Linear or Google Calendar?

Sync only brings things into DevBrain; nothing is sent back. See
[how sync works](/docs/integrations/#how-sync-works).

### Why don't images show in my notes?

DevBrain never loads anything from the internet in a note. See
[what the editor doesn't show](/docs/notes/#what-the-editor-doesnt-show).

### Only one DevBrain window opens

DevBrain runs once: opening it again brings its window forward. On macOS, closing the window keeps
DevBrain running; quit it with <kbd>⌘Q</kbd>.

### How do I update DevBrain?

Install the new version over the old one; see [Installing](/docs/install/#updating).
