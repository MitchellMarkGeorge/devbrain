import { createFileRoute } from '@tanstack/react-router';

// Settings: its sections, each a page of its own (/settings/general, /settings/tasks, …). The
// workspace layout draws the settings' sidebar in place of the app's while one is open
// (AppLayout); the sections the open workspace owns are listed apart from those every workspace
// shares. The settings are loaded here, before any section's page.
export const Route = createFileRoute('/app/$workspaceId/settings')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.query({ ...trpc.settings.get.queryOptions(), staleTime: 'static' }),
});
