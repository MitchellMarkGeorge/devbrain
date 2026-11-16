import { createFileRoute } from '@tanstack/react-router';
import { ImportExportSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/import-export')({
  component: ImportExportSettingsPage,
});
