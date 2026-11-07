import type { WorkspaceId } from '@common/ids';
import type { IpcErrorCode, SerializedError } from '@common/ipc/types';
import { isId } from '@common/ids';

// What went wrong opening or adding a workspace, in words, chosen by core's error code
// (docs/ipc/design.md, "The envelope and errors"). Figma 7423:37060–7423:37281.

/** The serialized error a failed call carries (TRPCClientError's `data`), or null. */
export function ipcErrorOf(error: unknown): SerializedError | null {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object' && typeof (data as SerializedError).code === 'string') {
    return data as SerializedError;
  }
  return null;
}

/** The error's code, or `internal` for anything that didn't come from main. */
export function ipcErrorCode(error: unknown): IpcErrorCode {
  return ipcErrorOf(error)?.code ?? 'internal';
}

export interface WorkspaceErrorCopy {
  title: string;
  description: string;
}

/** Why a workspace could not be opened. `name` is the workspace's, when known. */
export function openFailure(error: unknown, name: string | null): WorkspaceErrorCopy {
  const it = name ?? 'This workspace';
  switch (ipcErrorCode(error)) {
    case 'workspace_data_missing':
      return {
        title: name ? `Can’t find ${name}’s folder` : 'Can’t find this workspace’s folder',
        description:
          'It may have been moved, renamed or deleted. Put the folder back where it was to open the workspace again.',
      };
    case 'workspace_too_new':
      return {
        title: `${it} needs a newer DevBrain`,
        description:
          'It was last opened with a newer version of DevBrain. Update DevBrain to open it.',
      };
    case 'workspace_migration':
      return {
        title: `${it} couldn’t be updated`,
        description:
          'DevBrain couldn’t update this workspace’s data to this version, and left it as it was. Show the log file for the details.',
      };
    case 'not_found':
      return {
        title: 'This workspace isn’t in your list',
        description: 'It may have been deleted. Choose another workspace.',
      };
    default:
      return {
        title: `${it} couldn’t be opened`,
        description: ipcErrorOf(error)?.message ?? 'Something went wrong.',
      };
  }
}

/** Why a folder could not be added (workspaces.importFolder). */
export interface ImportFailure extends WorkspaceErrorCopy {
  /** the folder is in the list already, as this workspace: offer to open it */
  alreadyAdded: WorkspaceId | null;
  /** offer to pick another folder */
  chooseAnother: boolean;
}

export function importFailure(error: unknown): ImportFailure {
  const serialized = ipcErrorOf(error);
  const message = serialized?.message ?? 'Something went wrong.';
  if (serialized?.code === 'workspace_import') {
    const workspaceId = serialized.data.workspaceId;
    switch (serialized.data.reason) {
      case 'not_a_workspace':
        return {
          title: 'This folder isn’t a DevBrain workspace',
          description: `${message}. Choose the folder that holds the workspace, usually inside your DevBrain folder.`,
          alreadyAdded: null,
          chooseAnother: true,
        };
      case 'already_added':
        return {
          title: message,
          description: 'It’s one of your workspaces already: open it from there.',
          alreadyAdded: isId('workspace', workspaceId) ? workspaceId : null,
          chooseAnother: false,
        };
      case 'unreadable':
        return {
          title: 'DevBrain can’t read this folder',
          description: `${message}. Check the folder’s permissions, or choose another.`,
          alreadyAdded: null,
          chooseAnother: true,
        };
    }
  }
  if (serialized?.code === 'workspace_too_new') {
    return {
      title: 'This workspace needs a newer DevBrain',
      description:
        'It was last opened with a newer version of DevBrain. Update DevBrain to add it.',
      alreadyAdded: null,
      chooseAnother: true,
    };
  }
  return {
    title: 'This folder couldn’t be added',
    description: message,
    alreadyAdded: null,
    chooseAnother: true,
  };
}
