import type { WorkspaceId } from '@common/ids';
import {
  lastPageSchema,
  workspaceIdOfPage,
  type AppSettings,
  type WorkspaceInfo,
} from '@common/types';

/** The pages a workspace can open on (general.defaultLandingPage). */
export type LandingPage = AppSettings['general']['defaultLandingPage'];

/**
 * Where `/app/<id>` takes the window: the workspace's last page when "Reopen last page" is on and
 * the page saved is that workspace's (and not `/app/<id>` itself), else its landing page. The
 * saved page comes from the workspace's manifest (WorkspaceInfo.lastPage), written by main as it
 * closed, so it is parsed again here.
 */
export function landingHref(
  settings: Pick<AppSettings, 'general'>,
  workspace: Pick<WorkspaceInfo, 'id' | 'lastPage'> | null | undefined,
  id: WorkspaceId,
): string {
  const page = workspace?.id === id ? workspace.lastPage : null;
  if (
    settings.general.openToLastPage &&
    page !== null &&
    lastPageSchema.safeParse(page).success &&
    workspaceIdOfPage(page) === id &&
    !isWorkspaceIndex(page, id)
  ) {
    return page;
  }
  return `/app/${id}/${settings.general.defaultLandingPage}`;
}

// `/app/<id>` itself, which would only lead back here
function isWorkspaceIndex(page: string, id: WorkspaceId): boolean {
  const path = page.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return path === `/app/${id}`;
}
