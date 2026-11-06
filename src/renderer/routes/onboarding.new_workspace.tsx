import { createFileRoute } from '@tanstack/react-router';
import { NewWorkspacePage } from '../pages/onboarding/OnboardingPages';

export const Route = createFileRoute('/onboarding/new_workspace')({
  component: NewWorkspacePage,
});
