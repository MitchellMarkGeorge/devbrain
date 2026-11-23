---
title: Linear
description: 'Connect Linear to DevBrain with a personal API key: the issues assigned to you become tasks, with their projects, statuses and priorities mapped.'
---

Connect Linear, and the issues assigned to you appear in your [tasks](/docs/tasks/) beside your own,
with their [projects](/docs/projects/). DevBrain only reads from Linear: nothing you do in DevBrain
changes Linear. See [how sync works](/docs/integrations/#how-sync-works).

## Connecting

1. In Linear, open **Settings › Security & access** and create a **personal API key**.
2. In DevBrain, open **Settings › Integrations** and choose **Connect** next to Linear (or **Connect
   Account › Linear** when an account is already connected).
3. Paste the key into **Personal API key**. Leave **Tasks** ticked under "Use this account for".
4. Choose **Check Key and Connect**.

DevBrain checks the key with Linear, then stores it encrypted with your computer's keychain. It's
never shown again. The first sync starts at once, and the account's card shows your name and
Linear organisation.

| Message                                                   | What it means                                      |
| --------------------------------------------------------- | -------------------------------------------------- |
| Linear didn't accept this key                             | The key is wrong or revoked: copy it again whole.  |
| This Linear account is already connected to the workspace | It's connected already; nothing to do.             |
| This key is for another Linear account                    | When updating a key: use one for the same account. |

## What comes in

| From Linear                                                        | In DevBrain                  |
| ------------------------------------------------------------------ | ---------------------------- |
| Open issues assigned to you                                        | Tasks                        |
| Issues assigned to you, completed or cancelled in the last 30 days | Completed or Cancelled tasks |
| Their sub-issues (also assigned to you), at any depth              | Subtasks                     |
| The projects of those issues                                       | Projects                     |

A sub-issue whose parent isn't assigned to you comes in as a task of its own. That includes one
whose parent leaves later (reassigned to someone else, or deleted) while the sub-issue stays yours:
it becomes a task of its own then, and goes back under its parent if the parent comes back to you. Comments,
attachments, labels, cycles, and issues assigned to other people are not brought in.

Each task shows its issue's key (such as **ENG-124**), and its page says when it last synced.
**Filter › Source › Synced** on the Tasks page shows only these.

### Statuses and priorities

| Linear status type         | DevBrain status |
| -------------------------- | --------------- |
| Triage, Backlog, Unstarted | Not started     |
| Started                    | In progress     |
| Completed                  | Completed       |
| Canceled, Duplicate        | Cancelled       |

The status's own name in Linear (such as "In Review") is shown on the task.

| Linear priority | DevBrain priority |
| --------------- | ----------------- |
| Urgent, High    | High              |
| Medium          | Medium            |
| Low             | Low               |
| No priority     | No priority       |

### Projects

A Linear project comes in with its name, description, start and target dates, and colour. Its
status maps to **Not started** (Backlog, Planned), **Active** (Started), **On hold** (Paused) or
**Completed** (Completed, Canceled).

In the Projects list and at the top of its page, a synced project shows a **Linear** pill. Point at
it to see when it last synced.

When none of your issues are in a project any more, or it's deleted in Linear, it leaves DevBrain.
If you've put your own tasks in it, it stays instead, as a local project of yours.

## What you can do with them in DevBrain

A Linear task's title, description, status, priority, dates, project and subtasks are **read-only**:
change them in Linear (**Open in Linear** is in the task's **…** menu, and **Copy Linear URL**
copies its link). You can't drag it on the board or move it to the trash.

You can still:

- link it to an event or a note, and give it a task note;
- favourite it, search it, and duplicate it as a task of your own.

### Detaching a task

**Detach from Linear**, in the task's **…** menu, turns it into your own copy: editable, and no
longer updated by Linear. Your edits stay in DevBrain; nothing goes back to Linear. **Reattach to
Linear** puts Linear's version back, replacing your edits.

## When issues change in Linear

- Changes to your issues arrive at the next sync, every five minutes.
- An open issue reassigned to someone else, or deleted, leaves DevBrain within half an hour (or at
  once with **Sync Now**) and goes to the trash. If it comes back to you later, it comes back with
  its notes and links.
- To keep one that left, **Restore** it from the trash. It comes back as your own copy, as if you'd
  detached it, after DevBrain asks: editable, and no longer updated by Linear. If the issue comes
  back to you, **Reattach to Linear** puts Linear's version back.
- A completed or cancelled issue stays as it was last seen for 30 days, then stops syncing.

## Updating the key

If you revoke the key in Linear, or it stops working, the account shows **Needs reconnect** and
"Paused until you update the key", and nothing syncs. Your tasks stay where they are. Choose
**Update API Key**, paste a new key for the same account, and choose **Check Key and Update**.

You also need to do this after [moving the workspace to another computer](/docs/workspaces/#moving-a-workspace-to-another-computer).

## Disconnecting

**Disconnect…** on the account removes its key from your computer, and asks what to do with its
tasks and projects: **Keep as local copies** or **Remove them**. See
[Disconnecting](/docs/integrations/#disconnecting).
