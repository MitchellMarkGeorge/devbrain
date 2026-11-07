import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '../pages/shell/AppLayout';

// A workspace's pages: the root's guard keeps them to the open workspace's
export const Route = createFileRoute('/app')({
  component: AppLayout,
});
