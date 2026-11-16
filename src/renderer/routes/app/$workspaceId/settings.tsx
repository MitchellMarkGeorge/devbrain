import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@renderer/features/settings/page/SettingsPage';
import { settingsSearchSchema } from '@renderer/features/settings/api/search';

// The settings, by section in ?tab=tasks|calendar|data_storage (General without it).
export const Route = createFileRoute('/app/$workspaceId/settings')({
  validateSearch: settingsSearchSchema,
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.query({ ...trpc.settings.get.queryOptions(), staleTime: 'static' }),
  component: SettingsPage,
});
