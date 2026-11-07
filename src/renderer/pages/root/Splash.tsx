import { useQuery } from '@tanstack/react-query';
import { Logomark, OnboardingScreen, Progress } from '../../components';
import { trpc } from '../../ipc';
import type { SplashState } from '../../workspace/splash';
import styles from './Splash.module.css';

/**
 * The splash (Figma 7175:19848) over the whole window while a workspace opens and its first page
 * loads: the mark, "DevBrain", a progress bar, "Opening ‹name›…", and the version at the foot.
 */
export function Splash({ workspace }: Pick<SplashState, 'workspace'>) {
  const version = useQuery(trpc.app.version.queryOptions());
  const opening = workspace?.name ? `Opening ${workspace.name}…` : 'Opening workspace…';
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
