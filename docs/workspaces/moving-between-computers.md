# Moving a workspace between computers

A workspace is one folder: `<DevBrain folder>/workspaces/<wsp_id>/`, holding its database
(`db.sqlite`), its notes (`notes/`) and a manifest (`workspace.json`). To move a workspace to another
computer, bring that folder over, then choose **Open folder…** and pick it.

The renderer's **Open folder…** (in the workspace switcher, and **Open Existing Folder…** on the
Welcome screen, as in Figma) is still to be built. It calls `workspaces.importFolder`, which shows
the folder dialog in the main process and adds the folder picked, then `workspaces.open` with the id
returned. `importFolder` returns null when the dialog is cancelled.

## Steps

1. On the old computer, quit DevBrain, so the database is not being written while you copy it.
2. Copy the workspace folder to the new computer: a USB drive, AirDrop, a synced folder, anything.
   Copy the whole folder, including `db.sqlite-wal` if there is one: it can hold your latest
   changes.
3. On the new computer, choose **Open folder…** and pick the copied folder: the one that holds
   `db.sqlite`.
4. Sign in to your integrations again (below).

## What happens

`WorkspaceService.import` (`src/main/core/workspace/service.ts`):

- **The folder is copied in, not used in place.** DevBrain copies it into its own folder as
  `workspaces/<wsp_id>/` and works on the copy. The folder you picked is never changed: it isn't
  migrated, sync never writes to it, and deleting the workspace in DevBrain later removes only the
  copy, never the folder you picked. It also means a workspace never runs from inside a
  Dropbox or iCloud folder, where a sync tool copying a live SQLite database can corrupt it.
  The folder you picked can be deleted once the workspace has opened.
- **Name and colour come with it.** They are kept in `workspace.json` in the folder, written when a
  workspace is created, renamed or recoloured, and whenever it is opened (so workspaces made before this have one after
  their next open). A folder without one is named after the folder and shown in grey. A lost
  `workspaces.json` is also rebuilt from these manifests.
- **The id comes with it,** so it is the same workspace on both computers. A folder whose id is
  already in your list is refused (below).
- **An older database is updated** for this version of DevBrain, with the usual backup and restore
  if the update fails. A database last used by a **newer** DevBrain is refused: update DevBrain
  first. Opening one is refused the same way, so an older DevBrain never writes to a database it
  doesn't understand.
- The workspace is added to the list and then opened.

## Integrations need signing in again

Integration credentials are encrypted with a key kept in the computer's own keychain (Electron
`safeStorage`), so they can't be decrypted on another computer. When a workspace is imported, every
connected integration whose credentials don't decrypt is moved to **needs sign-in**
(`needs_reauth`), right away rather than on its first failed sync. Its sources, settings and synced
items are kept; reconnect it from the integration's settings to carry on syncing. A disabled
integration stays disabled and asks for sign-in when enabled.

On some Linux systems without a keychain, safeStorage uses a fixed key, and credentials do decrypt
on the other computer; those integrations stay connected.

## When a folder is refused

| What you see                  | Why                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| isn't a DevBrain workspace    | No `db.sqlite`, or one that isn't a DevBrain database. Pick the workspace folder itself. |
| already in your list          | A workspace with the same id or the same folder is in the list. Open it from there.      |
| doesn't have permission       | DevBrain can't read the folder or its files.                                             |
| last used by a newer DevBrain | Update DevBrain on this computer.                                                        |

Core throws `WorkspaceImportError` (code `workspace_import`, with a `reason` of `not_a_workspace`,
`already_added` or `unreadable`), `WorkspaceTooNewError` (`workspace_too_new`), and the usual
`WorkspaceMigrationError` and `FileExistsError`. Nothing is added when one is thrown, and any copy
already made is removed.

Bringing a workspace **back** to a computer that still has it in its list is refused as already in
the list. To replace the old copy, delete it there first, then open the folder.
