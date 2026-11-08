import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage, pageQueries } from '../../../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/settings')({
  staticData: { title: 'Settings' },
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...pageQueries.settings(), staleTime: 'static' }),
  component: SettingsPage,
});
