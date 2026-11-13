import { useCallback } from 'react';
import { DateTime } from 'luxon';
import { toast, useFormat, type Format } from '../../components';
import { ipcErrorOf } from '../../workspace/errors';

/** What a failed write says, in a toast: a title, and what to do about it. */
export interface MutationErrorCopy {
  title: string;
  description?: string;
}

/**
 * The words for a failed write, by core's error code (docs/ipc/design.md, "The envelope and
 * errors"). `action` names what failed ("Couldn’t move the task"); codes with a cause of their own
 * say it instead. Unknown failures are "Something went wrong": an internal error's message is
 * generic by design.
 */
export function mutationErrorCopy(
  error: unknown,
  action = 'That didn’t work',
  format: Pick<Format, 'formatTime'> | null = null,
): MutationErrorCopy {
  const serialized = ipcErrorOf(error);
  const code = serialized?.code ?? 'internal';
  switch (code) {
    case 'external_read_only':
      return {
        title: 'This task is synced from Linear',
        description: 'Change it there, or detach it to edit it here.',
      };
    case 'rate_limited': {
      const raw = serialized?.data.retryAt;
      const at = raw instanceof Date || typeof raw === 'string' ? new Date(raw) : null;
      const when =
        at && !Number.isNaN(at.getTime())
          ? (format?.formatTime(at) ?? DateTime.fromJSDate(at).toLocaleString(DateTime.TIME_SIMPLE))
          : null;
      return {
        title: 'Too many requests',
        description: when ? `Try again after ${when}.` : 'Try again in a few minutes.',
      };
    }
    case 'not_found':
      return { title: action, description: 'It may have been deleted.' };
    case 'already_archived':
      return { title: action, description: 'It’s already in the trash.' };
    case 'not_archived':
      return { title: action, description: 'It’s no longer in the trash.' };
    case 'task_hierarchy':
      return { title: action, description: serialized?.message };
    case 'invalid_input':
    case 'unsafe_url':
      return { title: action, description: serialized?.message };
    case 'integration_auth':
      return { title: action, description: 'The account needs reconnecting in Integrations.' };
    case 'integration_busy':
      return {
        title: action,
        description: 'The account is being reconnected. Try again once its sign-in has finished.',
      };
    case 'provider_unavailable':
    case 'provider_api':
      return { title: action, description: 'The service didn’t answer. Try again later.' };
    case 'no_workspace_open':
    case 'workspace_closed':
    case 'workspace_not_open':
      return { title: action, description: 'The workspace was closed.' };
    case 'internal':
      return {
        title: 'Something went wrong',
        description: action === 'That didn’t work' ? undefined : action,
      };
    default:
      return { title: action, description: serialized?.message };
  }
}

/**
 * Shows a failed write as an error toast, in the words `mutationErrorCopy` chooses:
 * `useMutation({ ...options, onError: useMutationErrorToast('Couldn’t move the task') })`, or call
 * it with the error and an action.
 */
export function useMutationErrorToast(defaultAction?: string) {
  const format = useFormat();
  return useCallback(
    (error: unknown, action: string | undefined = defaultAction) => {
      const copy = mutationErrorCopy(error, action, format);
      toast({ tone: 'error', title: copy.title, description: copy.description });
    },
    [format, defaultAction],
  );
}
