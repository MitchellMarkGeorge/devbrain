import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

// Onboarding, for when no workspace is open: Welcome, Create workspace, Choose workspace. With one
// open (Back from the app's first page), the window goes to it instead.
export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ context, preload }) => {
    const open = context.workspaces.openId;
    if (open && !context.workspaces.opening && !preload) {
      throw redirect({ to: '/app/$workspaceId', params: { workspaceId: open }, replace: true });
    }
  },
  component: Outlet,
});
