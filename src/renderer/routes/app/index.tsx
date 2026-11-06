import { createFileRoute, redirect } from '@tanstack/react-router';
import { resolveLandingPage } from '../../app/landing-page';

// `/app`: the default landing page (Settings › General)
export const Route = createFileRoute('/app/')({
  beforeLoad: async ({ context }) => {
    throw redirect({
      href: await resolveLandingPage(context),
      replace: true,
    });
  },
});
