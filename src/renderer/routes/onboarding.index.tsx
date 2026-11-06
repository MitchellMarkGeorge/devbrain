import { createFileRoute } from '@tanstack/react-router';
import { WelcomePage } from '../pages/onboarding/OnboardingPages';

export const Route = createFileRoute('/onboarding/')({
  component: WelcomePage,
});
