import type { WorkspaceId } from '@common/ids';
import {
  lastPageSchema,
  type AppSettings,
  type WorkspaceInfo,
  type WorkspaceStatus,
} from '@common/types';
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

/**
 * Where `/` sends the window once nothing is opening: the open workspace's landing page, or
 * onboarding while none is open.
 */
export async function destination(
  context: Pick<RouterContext, 'queryClient' | 'trpc'>,
  { id }: WorkspaceStatus,
): Promise<string> {
  if (id === null) return '/onboarding';
  return resolveLandingPage(context, await openWorkspaceInfo(context, id));
}

/**
 * The open workspace's info, with its last page: from the cache when it is the one cached and
 * nothing has changed since (as at startup, seeded from the initial load context), else from main.
 */
async function openWorkspaceInfo(
  { queryClient, trpc }: Pick<RouterContext, 'queryClient' | 'trpc'>,
  id: WorkspaceId,
): Promise<WorkspaceInfo | null> {
  const options = trpc.workspaces.current.queryOptions();
  const cached = queryClient.getQueryData(options.queryKey);
  if (cached?.id === id && !queryClient.getQueryState(options.queryKey)?.isInvalidated) {
    return cached;
  }
  return queryClient.fetchQuery({ ...options, staleTime: 0 }).catch(() => null);
}
