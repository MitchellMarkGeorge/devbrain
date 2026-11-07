import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { destination } from '../app/landing-page';
import { SPLASH_MINIMUM_MS, Splash } from '../app/Splash';
import { useWorkspaceStatus } from '../app/workspace-status';

// `/`: where the window goes whenever where it belongs may have changed (the app starts here, and
// the root comes here when a workspace starts opening or closes). While a workspace opens it shows
// the splash; once nothing is opening it replaces itself with the open workspace's landing page,
// or onboarding while none is open.
export const Route = createFileRoute('/')({
  // nothing opening: straight on, with no splash
  beforeLoad: async ({ context }) => {
    const status = context.workspaceStatus.get();
    if (status.opening !== null) return;
    throw redirect({ href: await destination(context, status), replace: true });
  },
  component: Opening,
});

function Opening() {
  const context = Route.useRouteContext();
  const router = useRouter();
  const status = useWorkspaceStatus();
  const list = useQuery(context.trpc.workspaces.list.queryOptions());
  // held at least this long, so a quick open doesn't flicker
  const [shownAt] = useState(() => Date.now());

  // the name of the workspace opening, kept while the splash is held past the open
  const [name, setName] = useState<string | null>(null);
  const shown = status.opening ?? status.id;
  const shownName = list.data?.items.find(({ id }) => id === shown)?.name ?? null;
  if (shownName !== null && shownName !== name) setName(shownName);

  const settled = status.opening === null;
  useEffect(() => {
    if (!settled) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void destination(context, status).then((href) => {
          if (!cancelled) void router.navigate({ href, replace: true });
        });
      },
      Math.max(0, shownAt + SPLASH_MINIMUM_MS - Date.now()),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settled, status, context, router, shownAt]);

  return <Splash name={name} />;
}
