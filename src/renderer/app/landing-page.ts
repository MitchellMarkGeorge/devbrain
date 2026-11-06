import { lastPageSchema, type AppSettings, type WorkspaceInfo } from '@common/types';
import type { RouterContext } from './context';

/**
 * Where a workspace opens: the page it was on when it last closed, when "Reopen last page" is on
 * and it saved one (and that is still a page in the app), else the default landing page. Without
 * settings, Home. Main saves the page in the workspace's manifest (src/main/runtime/last-page.ts).
 */
export function landingPage(
  settings: Pick<AppSettings, 'general'> | undefined,
  workspace: Pick<WorkspaceInfo, 'lastPage'> | null | undefined,
): string {
  const lastPage = workspace?.lastPage;
  if (settings?.general.openToLastPage && lastPageSchema.safeParse(lastPage).success) {
    return lastPage as string;
  }
  return `/app/${settings?.general.defaultLandingPage ?? 'home'}`;
}

/**
 * The landing page for `workspace`, with the settings from the cache (fetched once if not cached).
 * A failed read of the settings falls back to the default. Pass no workspace for the default
 * landing page alone (`/app`, Go Home).
 */
export async function resolveLandingPage(
  { queryClient, trpc }: Pick<RouterContext, 'queryClient' | 'trpc'>,
  workspace?: Pick<WorkspaceInfo, 'lastPage'> | null,
): Promise<string> {
  const settings = await queryClient
    .ensureQueryData(trpc.settings.get.queryOptions())
    .catch(() => undefined);
  return landingPage(settings, workspace);
}
