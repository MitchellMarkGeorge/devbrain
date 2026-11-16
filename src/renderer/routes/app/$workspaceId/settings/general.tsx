import { createFileRoute } from '@tanstack/react-router';
import { GeneralSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/general')({
  component: GeneralSettingsPage,
});
