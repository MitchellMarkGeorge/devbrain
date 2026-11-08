import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { openWorkspaceInfo } from '../../pages/app/workspace-route';

// Onboarding, for when no workspace is open: Welcome, Create workspace, Choose workspace. With one
// open (Back from the app's first page), the window goes to it instead.
export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context, preload }) => {
    if (preload) return;
    const open = (await openWorkspaceInfo(context))?.id;
    if (open) {
      throw redirect({ to: '/app/$workspaceId', params: { workspaceId: open }, replace: true });
    }
  },
  component: Outlet,
});
