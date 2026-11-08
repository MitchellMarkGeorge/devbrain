import type { HistoryState } from '@tanstack/react-router';
import type { WorkspaceId } from '@common/ids';
import { workspaceIdOfPage } from '@common/types';

/**
 * The workspace a location shows: the one its URL names, or, on a page that names none (Create
 * workspace), the one open behind it when it was opened, kept in its history entry's state
 * (`openWorkspaceId`). Leaving that page for the workspace behind it is then no switch: nothing
 * opens, so no splash.
 */
export function workspaceShownAt(location: {
  pathname: string;
  state: HistoryState;
}): WorkspaceId | null {
  return workspaceIdOfPage(location.pathname) ?? location.state.openWorkspaceId ?? null;
}
