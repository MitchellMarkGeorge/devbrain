import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import type { WorkspaceId } from '@common/ids';
import { Logomark, AppShell, Progress } from '../../components';
import { trpc } from '../../ipc';
import type { AppRouter } from '../../router';
import { useWorkspaceLoading } from './use-workspace-loading';
import styles from './Splash.module.css';

/**
 * The app's one splash, around the router (main.tsx): the whole window while a workspace loads
 * (`useWorkspaceLoading`), at startup and on a switch. It is laid out like any page, not over
 * one: the router draws nothing meanwhile (nothing on its first load; `RootLayout` no page during
 * a switch).
 */
export function WithSplash({ router, children }: { router: AppRouter; children: ReactNode }) {
  const loading = useWorkspaceLoading(router);
  const workspaceId = useRouterState({
    router,
    select: (state) => workspaceIdOfPage(state.location.pathname),
  });
  return (
    <>
      {loading && <Splash workspaceId={workspaceId} />}
      {children}
    </>
  );
}

/**
 * The splash (Figma 7175:19848): the mark, "DevBrain", a progress bar, "Opening ‹name›…" for the
 * workspace loading, and the version at the foot.
 */
function Splash({ workspaceId }: { workspaceId: WorkspaceId | null }) {
  const version = useQuery(trpc.app.version.queryOptions());
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const name = list.data?.items.find((workspace) => workspace.id === workspaceId)?.name;
  const opening = name ? `Opening ${name}…` : 'Opening workspace…';
  return (
    <AppShell
      aria-busy
      data-testid="splash"
      footer={version.data && <span className={styles.version}>Version {version.data}</span>}
    >
      <div className={styles.lockup}>
        <Logomark size="lg" />
        <p className={styles.name}>DevBrain</p>
        <div className={styles.loading}>
          <Progress value={null} aria-label={opening} className={styles.bar} />
          <span className={styles.opening} role="status">
            {opening}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
