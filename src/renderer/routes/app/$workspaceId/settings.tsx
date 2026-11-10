import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../../../pages/settings/SettingsPage';
import { settingsSearchSchema } from '../../../pages/settings/search';

// The settings, by section in ?tab=tasks|calendar|data_storage (General without it).
export const Route = createFileRoute('/app/$workspaceId/settings')({
  staticData: { title: 'Settings' },
  validateSearch: settingsSearchSchema,
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.query({ ...trpc.settings.get.queryOptions(), staleTime: 'static' }),
  component: SettingsPage,
});
