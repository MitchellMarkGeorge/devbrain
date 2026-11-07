import { createFileRoute } from '@tanstack/react-router';
import { NewWorkspace } from '../pages/onboarding/NewWorkspace';

export const Route = createFileRoute('/onboarding/new_workspace')({
  component: NewWorkspace,
});
