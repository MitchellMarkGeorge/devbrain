import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import { Logomark, AppShell, Progress } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import styles from './Splash.module.css';

/**
 * How long `/app/$workspaceId` waits before it shows the splash (its `pendingMs`). A load that
 * opens nothing (Back from Create workspace to the workspace still open, a reload) is done well
 * before, so it never flashes; an open takes SPLASH_MINIMUM_MS at least, so it shows almost at once.
 */
export const SPLASH_DELAY_MS = 50;

/**
 * The splash (Figma 7175:19848): the mark, "DevBrain", a progress bar, "Opening ‹name›…" for the
 * workspace the URL names, and the version at the foot. It is `/app/$workspaceId`'s pending
 * component, so it shows while that route opens its workspace: at startup and on a switch.
 */
export function Splash() {
  const workspaceId = useRouterState({
    select: (state) => workspaceIdOfPage(state.location.pathname),
  });
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
