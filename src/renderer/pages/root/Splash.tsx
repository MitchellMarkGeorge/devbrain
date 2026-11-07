import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import { Logomark, OnboardingScreen, Progress } from '../../components';
import { trpc } from '../../ipc';
import styles from './Splash.module.css';

/**
 * The splash (Figma 7175:19848), the whole window while a workspace opens and its first page
 * loads: the mark, "DevBrain", a progress bar, "Opening ‹name›…" for the workspace the URL names,
 * and the version at the foot. The /app/$workspaceId route's pending component.
 */
export function Splash() {
  const version = useQuery(trpc.app.version.queryOptions());
  const id = useRouterState({ select: (state) => workspaceIdOfPage(state.location.pathname) });
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const name = list.data?.items.find((workspace) => workspace.id === id)?.name;
  const opening = name ? `Opening ${name}…` : 'Opening workspace…';
  return (
    <OnboardingScreen
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
    </OnboardingScreen>
  );
}
