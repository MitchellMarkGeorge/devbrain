import { createFileRoute } from '@tanstack/react-router';
import { ChooseWorkspace } from '../pages/onboarding/ChooseWorkspace';

export const Route = createFileRoute('/onboarding/choose_workspace')({
  component: ChooseWorkspace,
});
