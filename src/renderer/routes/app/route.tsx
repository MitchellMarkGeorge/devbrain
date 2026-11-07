import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '../../components';
import { AppSidebar } from '../../app/AppSidebar';
import { useHistoryArrows } from '../../app/navigation';
import { PageHeaderSlotProvider, usePageHeaderSlot } from '../../app/page-header';
import { placeOf } from '../../app/workspace-status';

// `/app/*`: the app around an open workspace. While one is opening, or none is open (Back or
// Forward into the app after it closed), `/` instead, which says where to go.
export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (placeOf(context.workspaceStatus.get()) !== 'app')
      throw redirect({ to: '/', replace: true });
  },
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
