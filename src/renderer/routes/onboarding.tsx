import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { isOpeningWorkspace, openWorkspaceId } from '../workspace/open';

// Onboarding, for when no workspace is open: Welcome, Create workspace, Choose workspace. With one
// open (Back from the app's first page), the window goes to it instead.
export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ preload }) => {
    const open = openWorkspaceId();
    if (open && !isOpeningWorkspace() && !preload) {
      throw redirect({ to: '/app/$workspaceId', params: { workspaceId: open }, replace: true });
    }
  },
  component: Outlet,
});
