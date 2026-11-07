import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '../../components';
import { ipcErrorOf } from '../../ipc/errors';

// Why a workspace couldn't be added or opened (Figma 7423:37060–7423:37281), as a dialog over
// whatever the window shows: Welcome, or the app when a switch failed before the open one closed.
// WorkspaceActionsProvider (workspace-actions.tsx) shows it.

export interface WorkspaceFailure {
  error: unknown;
  // the workspace being opened, when known (an open; not a folder being added)
  workspace?: Pick<WorkspaceInfo, 'id' | 'name'>;
}

export interface WorkspaceErrorActions {
  // the registry, to name the workspace an `already_added` error points at
  workspaces: Pick<WorkspaceInfo, 'id' | 'name'>[];
  openFolder: () => void;
  open: (id: WorkspaceId) => void;
}

export interface Described {
  title: string;
  description: string;
  // the dialog's action; without one it has Close alone
  action?: { label: string; run: () => void };
}

/** What the dialog says about a failure, by main's error code. */
export function describeWorkspaceFailure(
  { error, workspace }: WorkspaceFailure,
  actions: WorkspaceErrorActions,
): Described {
  const failure = ipcErrorOf(error);
  const name = workspace?.name;
  switch (failure?.code) {
    case 'workspace_import': {
      const reason = failure.data.reason;
      if (reason === 'already_added') {
        const id = failure.data.workspaceId as WorkspaceId | null;
        const existing = actions.workspaces.find((w) => w.id === id);
        const known = existing?.name ?? 'This workspace';
        return {
          title: `${known} is already in your list`,
          description: existing
            ? `This folder is the ${existing.name} workspace you already have, so nothing was added.`
            : 'This folder is a workspace you already have, so nothing was added.',
          action: existing && {
            label: `Open ${existing.name}`,
            run: () => actions.open(existing.id),
          },
        };
      }
      if (reason === 'unreadable') {
        return {
          title: 'DevBrain can’t read this folder',
          description: `${failure.message}. Check its permissions, then try again.`,
          action: { label: 'Choose Another Folder', run: actions.openFolder },
        };
      }
      return {
        title: 'This folder isn’t a DevBrain workspace',
        description:
          'It has no DevBrain database in it. Choose the folder that holds the workspace, usually inside your DevBrain folder.',
        action: { label: 'Choose Another Folder', run: actions.openFolder },
      };
    }
    case 'workspace_too_new':
      return {
        title: `${name ?? 'This workspace'} needs a newer DevBrain`,
        description:
          'This workspace was last opened in a newer version. Update DevBrain to open it. The folder hasn’t been changed.',
      };
    case 'workspace_data_missing':
      return {
        title: name ? `Can’t find ${name}’s folder` : 'Can’t find the workspace’s folder',
        description: 'It may have been moved, renamed or deleted.',
      };
    default:
      return {
        title: name ? `${name} couldn’t be opened` : 'The workspace couldn’t be opened',
        description: failure?.message ?? 'Something went wrong. The log file has the details.',
      };
  }
}

/** The dialog for a failure: its action, or Close alone. */
export function WorkspaceErrorDialog({
  described: { title, description, action },
  onClose,
}: {
  described: Described;
  onClose: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-workspace-error="">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {action ? (
            <>
              <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
              <AlertDialogClose render={<Button variant="outline" />} onClick={action.run}>
                {action.label}
              </AlertDialogClose>
            </>
          ) : (
            <AlertDialogClose render={<Button variant="outline" />}>Close</AlertDialogClose>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
