import { toast } from '../components';
import { ipcFailureOf } from '../ipc/errors';
import { describeWorkspaceError } from '../pages/onboarding/WorkspaceErrorDialog';
import type { RouterContext } from './context';
import { resolveLandingPage } from './landing-page';
import { SPLASH_MINIMUM_MS } from './Splash';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Starts the app from `/` and says where to go next. With a workspace open already (a reload, a
 * second window), its landing page at once. Otherwise reopens the workspace open last time, holding
 * the splash long enough not to flicker, then goes to its landing page, or to onboarding when there
 * was none to reopen or it failed to open.
 */
export async function boot(
  context: RouterContext,
  { minimumMs = SPLASH_MINIMUM_MS }: { minimumMs?: number } = {},
): Promise<string> {
  const { queryClient, trpc, ipc, initialLoadContext } = context;
  const currentKey = trpc.workspaces.current.queryKey();
  if (queryClient.getQueryData(currentKey)) return resolveLandingPage(context);

  const started = Date.now();
  const opened = await ipc.workspaces.openLast.mutate().catch((error: unknown) => {
    const { title, description } = describeWorkspaceError(ipcFailureOf(error));
    toast({ tone: 'error', title, description });
    return null;
  });
  queryClient.setQueryData(currentKey, opened);
  if (initialLoadContext?.last) await delay(started + minimumMs - Date.now());
  return opened ? resolveLandingPage(context) : '/onboarding';
}
