import { createFileRoute } from '@tanstack/react-router';
import { CalendarSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/calendar')({
  component: CalendarSettingsPage,
});
