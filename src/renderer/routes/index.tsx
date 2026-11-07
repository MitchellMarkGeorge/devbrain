import { createFileRoute, redirect } from '@tanstack/react-router';
import { openWorkspaceLandingPage } from '../app/landing-page';

// `/`: where the app starts when a workspace opens (start-app.ts), and where an empty hash points.
// Never shown: it redirects to the open workspace's landing page, its last page with "Reopen last
// page" on, else the default.
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    throw redirect({ href: await openWorkspaceLandingPage(context), replace: true });
  },
});
