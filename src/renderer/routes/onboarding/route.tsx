import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { placeOf } from '../../app/workspace-status';

// `/onboarding/*`: the window while no workspace is open. While one is open or opening, `/`
// instead, which says where to go (the sidebar's New workspace… opens a dialog in the app rather
// than coming here).
export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ context }) => {
    if (placeOf(context.workspaceStatus.get()) !== 'onboarding') {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: Outlet,
});
