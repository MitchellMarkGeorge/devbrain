import { isValidLastPage, type AppSettings, type WorkspaceInfo } from '@common/types';
import type { Services } from './context';

/**
 * Where a workspace opens: the page it was on when it last closed, when "Reopen last page" is on
 * and it saved one (and that is still a page in the app), else the default landing page. Without
 * settings, Home. Main saves the page in the workspace's manifest (src/main/runtime/last-page.ts).
 */
export function landingPage(
  settings: Pick<AppSettings, 'general'> | null | undefined,
  workspace: Pick<WorkspaceInfo, 'lastPage'> | null | undefined,
): string {
  const lastPage = workspace?.lastPage;
  if (settings?.general.openToLastPage && isValidLastPage(lastPage)) return lastPage;
  return `/app/${settings?.general.defaultLandingPage ?? 'home'}`;
}

/**
 * The default landing page (`/app`, Go Home), with the settings from the cache (fetched once if
 * not cached). A failed read of the settings falls back to Home.
 */
export async function defaultLandingPage({
  queryClient,
  trpc,
}: Pick<Services, 'queryClient' | 'trpc'>): Promise<string> {
  const settings = await queryClient
    .ensureQueryData(trpc.settings.get.queryOptions())
    .catch(() => undefined);
  return landingPage(settings, null);
}
