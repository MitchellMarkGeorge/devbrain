import { createFileRoute } from '@tanstack/react-router';

// Where the window starts (an empty hash): the shell shows the splash while the last workspace
// reopens, then the session lands on its page, or on onboarding
export const Route = createFileRoute('/')({
  component: () => null,
});
