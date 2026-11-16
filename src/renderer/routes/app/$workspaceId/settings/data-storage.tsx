import { createFileRoute } from '@tanstack/react-router';
import { DataStorageSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/data-storage')({
  component: DataStorageSettingsPage,
});
