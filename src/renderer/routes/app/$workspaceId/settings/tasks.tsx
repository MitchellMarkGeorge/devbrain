import { createFileRoute } from '@tanstack/react-router';
import { TasksSettingsPage } from '@renderer/features/settings/page/SettingsPages';

export const Route = createFileRoute('/app/$workspaceId/settings/tasks')({
  component: TasksSettingsPage,
});
