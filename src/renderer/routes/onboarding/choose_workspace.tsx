import { createFileRoute } from '@tanstack/react-router';
import {
  ChooseWorkspace,
  workspacePagesOptions,
} from '@renderer/features/onboarding/page/ChooseWorkspace';

export const Route = createFileRoute('/onboarding/choose_workspace')({
  loader: ({ context: { queryClient } }) =>
    queryClient.infiniteQuery({ ...workspacePagesOptions(), staleTime: 'static' }),
  component: ChooseWorkspace,
});
