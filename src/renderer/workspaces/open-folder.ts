import type { SerializedError } from '@common/ipc/types';

// What "Open folder…" says when a folder can't be added, from the error main sent
// (workspaces.importFolder). Written for the person who picked the folder: what went wrong and
// what to do next.
export function openFolderErrorMessage(error: SerializedError | undefined): string {
  if (error === undefined) return "That folder couldn't be opened.";
  switch (error.code) {
    case 'workspace_import':
      switch (error.data.reason) {
        case 'not_a_workspace':
          return "That folder isn't a DevBrain workspace. Choose the workspace folder itself: it holds a db.sqlite file.";
        case 'already_added':
          return 'That workspace is already in your list. Open it from there.';
        case 'unreadable':
          return "DevBrain doesn't have permission to read that folder. Check its permissions and try again.";
      }
      return error.message;
    case 'workspace_too_new':
      return 'That workspace was last used by a newer version of DevBrain. Update DevBrain to open it.';
    case 'workspace_migration':
      return "That workspace couldn't be updated for this version of DevBrain. The folder you chose was left as it was.";
    case 'file_exists':
      return "A folder for that workspace is already in DevBrain's folder, but not in your list. Move it away and try again.";
    default:
      return "That folder couldn't be opened.";
  }
}
