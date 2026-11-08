import { createFileRoute, redirect } from '@tanstack/react-router';
import { openWorkspaceInfo } from '../pages/app/workspace-route';

// `/`: an empty hash. Main always gives the window a route, so this is reached only by a URL
// without one: the open workspace's page, or onboarding.
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const open = (await openWorkspaceInfo(context))?.id;
    if (open) throw redirect({ to: '/app/$workspaceId', params: { workspaceId: open } });
    throw redirect({ to: '/onboarding' });
  },
});
