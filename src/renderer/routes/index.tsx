import { createFileRoute, redirect } from '@tanstack/react-router';
import { landingPage } from '../app/landing-page';

// `/`: where the app starts when a workspace opens (start-app.ts), and where an empty hash points.
// Never shown: it redirects to the open workspace's landing page, its last page with "Reopen last
// page" on, else the default.
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const { queryClient, trpc, openWorkspace } = context;
    const settings = queryClient.getQueryData(trpc.settings.get.queryKey());
    throw redirect({ href: landingPage(settings, openWorkspace()), replace: true });
  },
});
