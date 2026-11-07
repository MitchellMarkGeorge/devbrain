import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultLandingPage } from '../../app/landing-page';

// `/app`: the default landing page (Settings › General), where Go Home goes
export const Route = createFileRoute('/app/')({
  beforeLoad: async ({ context }) => {
    throw redirect({ href: await defaultLandingPage(context), replace: true });
  },
});
