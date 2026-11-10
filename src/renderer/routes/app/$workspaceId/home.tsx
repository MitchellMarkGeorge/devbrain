import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '../../../pages/home/HomePage';
import { loadHome } from '../../../pages/home/queries';

// Home: what matters right now (pages/home).
export const Route = createFileRoute('/app/$workspaceId/home')({
  staticData: { title: 'Home' },
  loader: ({ context }) => loadHome(context),
  component: HomePage,
});
