import { createFileRoute, redirect } from '@tanstack/react-router';

// Integrations moved into the settings; an older link (a saved last page) goes there.
export const Route = createFileRoute('/app/$workspaceId/integrations')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/app/$workspaceId/settings/integrations', params, replace: true });
  },
});
