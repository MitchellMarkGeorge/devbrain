---
title: Installing DevBrain
description: 'Install DevBrain on macOS (Apple silicon or Intel), Windows or Linux, where it keeps your data, and how to update to a new version.'
---

Get the installer for your computer from the [download page](/download/).

## macOS

1. Download the `.dmg` for your Mac: **Apple silicon** for Macs with an M-series chip, **Intel**
   for older ones (Apple menu › About This Mac tells you which).
2. Open it and drag **DevBrain** into **Applications**.
3. Open DevBrain from Applications or Spotlight.

## Windows

1. Download `DevBrain-Setup-<version>-x64.exe` and run it.
2. DevBrain installs for your user account only, so it doesn't need an administrator, and opens
   when it's done. Find it again in the Start menu.

To uninstall it, use **Settings › Apps**.

## Linux

DevBrain is an AppImage: one file that runs on most x64 distributions.

```bash
chmod +x DevBrain-*-x86_64.AppImage
./DevBrain-*-x86_64.AppImage
```

:::note
On Ubuntu 24.04 and later, the system restricts the user namespaces Chromium's sandbox needs, so
DevBrain starts without the operating system's sandbox around its window. The app's own
protections (no Node.js in the page, strict isolation) still apply.
:::

## Where your data lives

DevBrain keeps everything in one folder, `.devbrain` in your home folder: its settings, and a
folder for each [workspace](/docs/workspaces/). Uninstalling DevBrain leaves it in place. See
[Data and privacy](/docs/data-and-privacy/).

## Updating

DevBrain doesn't update itself yet. To update, download the new version and install it over the
old one; your workspaces are kept and updated for the new version when they open.

A workspace opened by a newer DevBrain can't be opened by an older one, so you can't go back a
version once a workspace has been updated.
