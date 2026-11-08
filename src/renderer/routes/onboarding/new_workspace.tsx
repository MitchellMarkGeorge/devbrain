import { createFileRoute } from '@tanstack/react-router';
import { CreateWorkspacePage } from '../../pages/onboarding/CreateWorkspacePage';

export const Route = createFileRoute('/onboarding/new_workspace')({
  component: CreateWorkspacePage,
});
