import { lastPageSchema, type AppSettings } from '@common/types';
import type { RouterContext } from './context';

/**
 * Where the app opens: the last page when "Reopen last page" is on and one was saved (and is still
 * a page in the app), else the default landing page. Without settings, Home.
 */
export function landingPage(
  settings: Pick<AppSettings, 'general'> | undefined,
  lastPage: string | null | undefined,
): string {
  if (settings?.general.openToLastPage && lastPageSchema.safeParse(lastPage).success) {
    return lastPage as string;
  }
  return `/app/${settings?.general.defaultLandingPage ?? 'home'}`;
}

/**
 * The landing page from the cache: the settings (fetched once if not cached) and the last page
 * (seeded from the initial load context). A failed read falls back to the default.
 * `withLastPage: false` is for a switch of workspace: the page saved last is the old workspace's.
 */
export async function resolveLandingPage(
  { queryClient, trpc }: Pick<RouterContext, 'queryClient' | 'trpc'>,
  { withLastPage = true }: { withLastPage?: boolean } = {},
): Promise<string> {
  const [settings, lastPage] = await Promise.all([
    queryClient.ensureQueryData(trpc.settings.get.queryOptions()).catch(() => undefined),
    withLastPage
      ? queryClient.ensureQueryData(trpc.settings.lastPage.queryOptions()).catch(() => null)
      : null,
  ]);
  return landingPage(settings, lastPage);
}
