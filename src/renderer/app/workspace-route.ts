import { notFound } from '@tanstack/react-router';
import { isId, type WorkspaceId } from '@common/ids';
import { SPLASH_MINIMUM_MS, type RouterContext } from './router';

// What the /app/$workspaceId route does before any page in it loads (routes/app/$workspaceId/route.tsx).

/** The URL's workspace id, checked: anything but a workspace id is no page. */
export const parseWorkspaceParams = {
  parse: ({ workspaceId }: { workspaceId: string }): { workspaceId: WorkspaceId } => {
    if (!isId('workspace', workspaceId)) throw notFound();
    return { workspaceId };
  },
  stringify: ({ workspaceId }: { workspaceId: WorkspaceId }) => ({ workspaceId }),
};

/** A preload into a workspace that isn't open stops here, quietly. */
export class PreloadSkipped extends Error {
  constructor() {
    super('A preload never opens a workspace');
    this.name = 'PreloadSkipped';
  }
}

/** The workspace main has open, from the cache unless an event has made it stale since. */
export function openWorkspaceInfo({ queryClient, trpc }: RouterContext) {
  return queryClient.query({ ...trpc.workspaces.current.queryOptions(), staleTime: Infinity });
}

/**
 * Opens the workspace the URL names when it isn't the open one, and waits for it, so every loader
 * below runs against it; the splash, the route's pending component, shows meanwhile. The open
 * waits `splashMinimumMs` at least, so the splash doesn't flicker. Nothing when
 * it is open (a reload, a navigation within it). A preload (hovering a link, with
 * `defaultPreload: 'intent'`) never opens one: into a workspace that isn't open it throws, which
 * ends the preload before any loader of its pages runs (they would read the workspace open now).
 * A failed open rejects with its error, for the route's error page.
 */
export async function openWorkspaceOf({
  params,
  preload,
  context,
}: {
  params: { workspaceId: WorkspaceId };
  preload: boolean;
  context: RouterContext;
}): Promise<void> {
  const id = params.workspaceId;
  const open = await openWorkspaceInfo(context);
  if (open?.id === id) return;
  if (preload) throw new PreloadSkipped();
  const { queryClient, trpc } = context;
  try {
    const [info] = await Promise.all([
      context.ipc.workspaces.open.mutate({ id }),
      delay(context.splashMinimumMs ?? SPLASH_MINIMUM_MS),
    ]);
    queryClient.setQueryData(trpc.workspaces.current.queryKey(), info);
  } catch (error) {
    // the error page offers the way back to the workspace still open, or none: ask main which,
    // as the open may have closed the one before
    await queryClient.query({ ...trpc.workspaces.current.queryOptions(), staleTime: 0 });
    throw error;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
