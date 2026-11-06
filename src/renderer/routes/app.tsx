import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '../components';
import { AppSidebar } from '../app/AppSidebar';
import { useHistoryArrows, useSaveLastPage } from '../app/navigation';
import { PageHeaderSlotProvider, usePageHeaderSlot } from '../app/page-header';

// `/app/*`: the app around an open workspace. With none open, onboarding instead.
export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context: { queryClient, trpc } }) => {
    const options = trpc.workspaces.current.queryOptions();
    // seeded from the initial load context, so this is synchronous but for a page without one
    const current =
      queryClient.getQueryData(options.queryKey) ??
      (await queryClient.ensureQueryData(options).catch(() => null));
    if (!current) throw redirect({ to: '/onboarding', replace: true });
  },
  component: AppLayout,
});

function AppLayout() {
  const arrows = useHistoryArrows();
  const { header, slot } = usePageHeaderSlot();
  useSaveLastPage();
  return (
    <PageHeaderSlotProvider value={slot}>
      <AppShell sidebar={<AppSidebar />} header={header} {...arrows}>
        <Outlet />
      </AppShell>
    </PageHeaderSlotProvider>
  );
}
