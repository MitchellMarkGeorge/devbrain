import { notFound, type ParsedLocation } from '@tanstack/react-router';
import { isId, type WorkspaceId } from '@common/ids';
import type { RouterContext } from '../../router';

// What the /app/$workspaceId route does before any page in it loads (routes/app.$workspaceId.tsx).

/** The URL's workspace id, checked: anything but a workspace id is no page. */
export const parseWorkspaceParams = {
  parse: ({ workspaceId }: { workspaceId: string }): { workspaceId: WorkspaceId } => {
    if (!isId('workspace', workspaceId)) throw notFound();
    return { workspaceId };
  },
  stringify: ({ workspaceId }: { workspaceId: WorkspaceId }) => ({ workspaceId }),
};

/** A preload into a workspace that isn't open (or is opening) stops here, quietly. */
export class PreloadSkipped extends Error {
  constructor() {
    super('A preload never opens a workspace');
    this.name = 'PreloadSkipped';
  }
}

/**
 * Opens the workspace the URL names when it isn't the open one, showing the splash first, and
 * waits for it, so every loader below runs against it. Nothing when it is open (a reload, a
 * navigation within it). A preload (hovering a link, with `defaultPreload: 'intent'`) never opens
 * one: into a workspace that isn't settled open it throws, which ends the preload before any
 * loader of its pages runs (their loaders would read the workspace open now, not this one).
 */
export async function openWorkspaceOf({
  params,
  preload,
  context: { workspaces, splash, queryClient, trpc },
}: {
  params: { workspaceId: WorkspaceId };
  preload: boolean;
  location?: ParsedLocation;
  context: RouterContext;
}): Promise<void> {
  const id = params.workspaceId;
  if (preload) {
    if (!workspaces.isSettledOn(id)) throw new PreloadSkipped();
    return;
  }
  await workspaces.ensureOpen(id, () => {
    const name =
      queryClient
        .getQueryData(trpc.workspaces.list.queryKey())
        ?.items.find((workspace) => workspace.id === id)?.name ?? null;
    splash.begin({ id, name });
  });
}
