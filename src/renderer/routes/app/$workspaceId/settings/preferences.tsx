import { createFileRoute } from '@tanstack/react-router';
import { PreferencesSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/preferences')({
  component: PreferencesSettingsPage,
});
