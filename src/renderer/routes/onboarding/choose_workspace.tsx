import { createFileRoute } from '@tanstack/react-router';
import { ChooseWorkspacePage } from '../../pages/onboarding/OnboardingPages';

export const Route = createFileRoute('/onboarding/choose_workspace')({
  component: ChooseWorkspacePage,
});
