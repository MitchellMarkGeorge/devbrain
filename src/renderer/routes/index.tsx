import { useEffect, useRef } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { boot } from '../app/boot';
import { Splash } from '../app/Splash';

// `/`: where the app starts (an empty hash). Draws the splash while the last workspace reopens,
// then replaces itself with the landing page or onboarding.
export const Route = createFileRoute('/')({
  component: Boot,
});

function Boot() {
  const context = Route.useRouteContext();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // once per page load, StrictMode's second effect included
    if (started.current) return;
    started.current = true;
    void boot(context).then((href) => router.navigate({ href, replace: true }));
  }, [context, router]);

  const opening =
    context.queryClient.getQueryData(context.trpc.workspaces.current.queryKey()) ??
    context.initialLoadContext?.last;
  return <Splash name={opening?.name} />;
}
