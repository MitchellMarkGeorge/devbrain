import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '../../components';
import { AppSidebar } from '../../app/AppSidebar';
import { useHistoryArrows } from '../../app/navigation';
import { PageHeaderSlotProvider, usePageHeaderSlot } from '../../app/page-header';

// `/app/*`: the app around the open workspace. Only the app's router (app/WorkspaceApp.tsx) comes
// here, and it exists only while a workspace is open, so there is nothing to guard.
export const Route = createFileRoute('/app')({
  component: AppLayout,
});

function AppLayout() {
  const arrows = useHistoryArrows();
  const { header, slot } = usePageHeaderSlot();
  return (
    <PageHeaderSlotProvider value={slot}>
      <AppShell sidebar={<AppSidebar />} header={header} {...arrows}>
        <Outlet />
      </AppShell>
    </PageHeaderSlotProvider>
  );
}
