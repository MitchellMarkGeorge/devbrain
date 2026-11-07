import { createFileRoute } from '@tanstack/react-router';
import { Welcome } from '../pages/onboarding/Welcome';

export const Route = createFileRoute('/onboarding/')({
  component: Welcome,
});
