import { createFileRoute, Outlet } from '@tanstack/react-router';

// The window with no workspace open: the root's guard keeps it to when none is. Each page draws
// its own OnboardingScreen, from the workspace list it loads here.
export const Route = createFileRoute('/onboarding')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.workspaces.list.queryOptions()),
  component: Outlet,
});
