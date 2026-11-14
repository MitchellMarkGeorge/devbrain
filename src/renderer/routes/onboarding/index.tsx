import { createFileRoute } from '@tanstack/react-router';
import { Welcome } from '@renderer/features/onboarding/components/Welcome';

export const Route = createFileRoute('/onboarding/')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.query({ ...trpc.workspaces.list.queryOptions(), staleTime: 'static' }),
  component: Welcome,
});
