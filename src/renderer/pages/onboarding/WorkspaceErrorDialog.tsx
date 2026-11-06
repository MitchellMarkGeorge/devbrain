import { useState } from 'react';
import type { WorkspaceId } from '@common/ids';
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
import { useServices } from '../../app/context';
import { ipcFailureOf, type IpcFailure } from '../../ipc/errors';

// Why a workspace couldn't be added or opened (Figma `7423:37060`–`7423:37281`), by main's error
// code and, for `workspace_import`, its `reason`. The description is core's message, which names
// the folder or the workspace.

type Remedy = 'choose_folder' | 'open_existing' | null;

export interface WorkspaceErrorText {
  title: string;
  description: string;
  remedy: Remedy;
}

export function describeWorkspaceError(failure: IpcFailure | null): WorkspaceErrorText {
  const description = failure?.message ?? SOMETHING_WENT_WRONG.message;
  switch (failure?.code) {
    case 'workspace_import':
      switch (failure.data.reason) {
        case 'not_a_workspace':
          return {
            title: 'This folder isn’t a DevBrain workspace',
            description: `${description}. Choose the folder that holds the workspace, usually inside your DevBrain folder.`,
            remedy: 'choose_folder',
          };
        case 'already_added':
          return {
            title: 'This workspace is already in your list',
            description: `${description}.`,
            remedy: typeof failure.data.workspaceId === 'string' ? 'open_existing' : null,
          };
        case 'unreadable':
          return {
            title: 'DevBrain can’t read this folder',
            description: `${description}. Check the folder’s permissions, or choose another one.`,
            remedy: 'choose_folder',
          };
        default:
          return { title: 'This folder can’t be added', description, remedy: 'choose_folder' };
      }
    case 'workspace_too_new':
      return {
        title: 'This workspace needs a newer DevBrain',
        description: `${description}.`,
        remedy: null,
      };
    case 'workspace_data_missing':
      return {
        title: 'This workspace’s folder is missing',
        description:
          'DevBrain can’t find the workspace’s folder or its data. It may have been moved or deleted.',
        remedy: null,
      };
    case 'workspace_migration':
      return {
        title: 'This workspace couldn’t be updated',
        description: `${description}. Nothing in it was lost.`,
        remedy: null,
      };
    default:
      return { title: 'Couldn’t open the workspace', description, remedy: null };
  }
}

export interface WorkspaceActions {
  /** opens a workspace: the switch splash shows, and the root goes to its landing page */
  open: (id: WorkspaceId) => void;
  /** "Open Existing Folder…": adds a workspace folder, then opens it */
  openFolder: () => void;
  /** a failure to show, or null */
  failure: IpcFailure | null;
  /** shows a failure from elsewhere (the create form) */
  show: (failure: IpcFailure | null) => void;
  dismiss: () => void;
  pending: boolean;
}

const SOMETHING_WENT_WRONG: IpcFailure = {
  code: 'internal',
  message: 'Something went wrong',
  data: {},
};

/** Opening a workspace, or adding one from a folder, with what went wrong kept for the dialog. */
export function useWorkspaceActions(): WorkspaceActions {
  const { ipc } = useServices();
  const [failure, setFailure] = useState<IpcFailure | null>(null);
  const [pending, setPending] = useState(false);

  const show = (failure: IpcFailure | null) => setFailure(failure ?? SOMETHING_WENT_WRONG);
  const run = (action: () => Promise<unknown>) => {
    setFailure(null);
    setPending(true);
    action()
      .catch((error: unknown) => show(ipcFailureOf(error)))
      .finally(() => setPending(false));
  };

  return {
    open: (id) => run(() => ipc.workspaces.open.mutate({ id })),
    openFolder: () =>
      run(async () => {
        const added = await ipc.workspaces.importFolder.mutate();
        if (added) await ipc.workspaces.open.mutate({ id: added.id });
      }),
    failure,
    show,
    dismiss: () => setFailure(null),
    pending,
  };
}

/** The alert for a failed open or add, with what can be done about it. */
export function WorkspaceErrorDialog({ actions }: { actions: WorkspaceActions }) {
  const { failure } = actions;
  const text = describeWorkspaceError(failure);
  const existing = failure?.data.workspaceId as WorkspaceId | undefined;
  return (
    <AlertDialog
      open={failure !== null}
      onOpenChange={(open) => {
        if (!open) actions.dismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {text.remedy === null ? (
            <AlertDialogClose render={<Button />}>OK</AlertDialogClose>
          ) : (
            <>
              <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
              {text.remedy === 'choose_folder' ? (
                <Button onClick={actions.openFolder}>Choose Another Folder</Button>
              ) : (
                <Button onClick={() => existing && actions.open(existing)}>Open It</Button>
              )}
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
