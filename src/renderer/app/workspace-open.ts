import { ipcErrorCode } from '../ipc/errors';

/**
 * Whether a failed `workspaces.open` failed before the open began: its id isn't registered (a
 * stale list) or its input was refused. Only then is it the caller's to show. Any other failure
 * came after core sent `opening`, so the workspace state has changed: the splash has replaced the
 * part of the window that asked, and the state's error shows the failure wherever the window is
 * next (onboarding's dialog, or a toast in the app).
 */
export function failedBeforeOpening(error: unknown): boolean {
  const code = ipcErrorCode(error);
  return code === 'not_found' || code === 'invalid_input';
}
