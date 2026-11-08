import { createFileRoute, redirect } from '@tanstack/react-router';
import { landingHref } from '../../../workspace/landing';

// `/app/<id>`, the workspace's link (the menu, onboarding, Create, Open Folder): its last page
// when "Reopen last page" is on, else its landing page.
export const Route = createFileRoute('/app/$workspaceId/')({
  beforeLoad: async ({ context: { queryClient, trpc }, params }) => {
    const settings = await queryClient.query({
      ...trpc.settings.get.queryOptions(),
      staleTime: 'static',
    });
    const current = queryClient.getQueryData(trpc.workspaces.current.queryKey());
    throw redirect({ href: landingHref(settings, current, params.workspaceId), replace: true });
  },
});
