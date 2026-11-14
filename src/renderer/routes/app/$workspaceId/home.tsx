import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@renderer/features/home/page/HomePage';
import { loadHome } from '@renderer/features/home/api/queries';

// Home: what matters right now (features/home).
export const Route = createFileRoute('/app/$workspaceId/home')({
  staticData: { title: 'Home' },
  loader: ({ context }) => loadHome(context),
  component: HomePage,
});
