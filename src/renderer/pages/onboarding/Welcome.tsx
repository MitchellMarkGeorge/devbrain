import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CircleHelp, Folder, Plus } from 'lucide-react';
import { Button, Logomark, AppShell, WorkspaceList } from '../../components';
import { trpc } from '../../ipc';
import { byRecentlyOpened, WorkspaceRow } from './workspace-rows';
import { useOpenFolder } from '../workspaces/use-open-folder';
import styles from './Onboarding.module.css';

// how many recent workspaces the card shows; Choose workspace lists them all
const RECENT_LIMIT = 5;

/**
 * Welcome (Figma 7175:19898; with workspaces, 7285:53770): the recent workspaces, each going to
 * its workspace, then Create Workspace and Open Existing Folder…. "What's a workspace?" is drawn
 * disabled: there is no help yet.
 */
export function Welcome() {
  const { data } = useSuspenseQuery(trpc.workspaces.list.queryOptions());
  const openFolder = useOpenFolder();
  const workspaces = byRecentlyOpened(data.items);
  const more = workspaces.length > RECENT_LIMIT || data.nextCursor !== null;
  return (
    <AppShell
      logo={<Logomark size="md" />}
      title="Welcome to DevBrain"
      description={
        workspaces.length > 0
          ? 'Pick up where you left off, or start a new workspace.'
          : 'Create a workspace for your tasks, notes and calendar, or open one from a folder.'
      }
      footer={
        <Button variant="ghost" size="sm" icon={CircleHelp} disabled>
          What’s a workspace?
        </Button>
      }
    >
      {workspaces.length > 0 && (
        <WorkspaceList label="Recent workspaces" className={styles.list}>
          {workspaces.slice(0, RECENT_LIMIT).map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} />
          ))}
          {more && (
            <Button
              variant="link"
              size="sm"
              className={styles.more}
              render={<Link to="/onboarding/choose_workspace" />}
              nativeButton={false}
            >
              All workspaces
            </Button>
          )}
        </WorkspaceList>
      )}
      <div className={styles.actions}>
        <Button icon={Plus} render={<Link to="/workspaces/new" />} nativeButton={false}>
          Create Workspace
        </Button>
        <Button icon={Folder} onClick={openFolder.run} disabled={openFolder.pending}>
          Open Existing Folder…
        </Button>
      </div>
    </AppShell>
  );
}
