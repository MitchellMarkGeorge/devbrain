import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

// `/onboarding/*`: the window while no workspace is open. With one open, the app instead (the
// sidebar's New workspace… opens a dialog there rather than coming here).
export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ context: { queryClient, trpc } }) => {
    if (queryClient.getQueryData(trpc.workspaces.current.queryKey())) {
      throw redirect({ to: '/app', replace: true });
    }
  },
  component: Outlet,
});
