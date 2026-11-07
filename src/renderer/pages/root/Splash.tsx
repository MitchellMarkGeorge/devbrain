import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { Logomark, OnboardingScreen, Progress } from '../../components';
import styles from './Splash.module.css';

/**
 * The splash (Figma 7175:19848), while a workspace opens and its first page loads: "Opening
 * ‹name›…" when the session knows which, from the workspace list main seeded.
 */
export function Splash() {
  const { session, trpc, devBrainAvailable } = useRouter().options.context;
  const opening = useSyncExternalStore(session.subscribe, () => session.getState().opening);
  const list = useQuery({ ...trpc.workspaces.list.queryOptions(), enabled: devBrainAvailable });
  const version = useQuery({ ...trpc.app.version.queryOptions(), staleTime: Infinity });
  const name = list.data?.items.find((workspace) => workspace.id === opening)?.name;
  return (
    <OnboardingScreen
      data-splash=""
      role="status"
      aria-label={name ? `Opening ${name}` : 'Opening DevBrain'}
      aria-busy
      logo={<Logomark size="lg" pulse />}
      footer={version.data && <span className={styles.version}>Version {version.data}</span>}
    >
      <div className={styles.body}>
        <h1 className={styles.name}>DevBrain</h1>
        <Progress value={null} className={styles.progress} aria-label="Opening" />
        <span className={styles.status}>{name ? `Opening ${name}…` : 'Opening…'}</span>
      </div>
    </OnboardingScreen>
  );
}
