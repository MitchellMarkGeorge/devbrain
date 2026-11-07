import { createFileRoute, redirect } from '@tanstack/react-router';

// `/app` alone: the default landing page, from Settings
export const Route = createFileRoute('/app/')({
  beforeLoad: async ({ context: { queryClient, trpc } }) => {
    const settings = await queryClient.fetchQuery(trpc.settings.get.queryOptions());
    throw redirect({ to: `/app/${settings.general.defaultLandingPage}`, replace: true });
  },
});
