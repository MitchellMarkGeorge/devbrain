import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleHelp, Folder, List, Plus } from 'lucide-react';
import { Button, Logomark, OnboardingScreen, Text } from '../../components';
import { useServices } from '../../app/context';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { useWorkspaceActions } from './WorkspaceErrorDialog';
import { byLastOpened, WorkspacePicker } from './WorkspacePicker';
import styles from './onboarding.module.css';

// how many workspaces Welcome's card lists; the rest are on Choose workspace
export const RECENT_WORKSPACES = 3;

/** The onboarding screens, which OnboardingApp switches between. */
export type OnboardingScreenName = 'welcome' | 'new_workspace' | 'choose_workspace';

interface OnboardingPageProps {
  /** shows another onboarding screen */
  go: (screen: OnboardingScreenName) => void;
}

/** Help has nothing behind it yet, so the link is drawn disabled. */
function WhatsAWorkspace() {
  return (
    <Button variant="ghost" size="sm" icon={CircleHelp} disabled>
      What’s a workspace?
    </Button>
  );
}

/**
 * Welcome (Figma `7175:19898`; with workspaces `7285:53770`): the recent workspaces
 * when there are any, then Create Workspace and Open Existing Folder….
 */
export function WelcomePage({ go }: OnboardingPageProps) {
  const { trpc } = useServices();
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const actions = useWorkspaceActions();
  const workspaces = [...(list.data?.items ?? [])].sort(byLastOpened);
  const hasMore = workspaces.length > RECENT_WORKSPACES || list.data?.nextCursor != null;
  const any = workspaces.length > 0;

  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="Welcome to DevBrain"
      description={
        any
          ? 'Pick up where you left off, or start a new workspace.'
          : 'Your tasks, notes, projects and calendar, in one place. Start with a workspace.'
      }
      footer={<WhatsAWorkspace />}
    >
      {any && (
        <WorkspacePicker
          label="Recent workspaces"
          workspaces={workspaces.slice(0, RECENT_WORKSPACES)}
          onOpen={actions.open}
          disabled={actions.pending}
        />
      )}
      <div className={styles.actions}>
        <Button icon={Plus} onClick={() => go('new_workspace')}>
          Create Workspace
        </Button>
        <Button icon={Folder} onClick={actions.openFolder} disabled={actions.pending}>
          Open Existing Folder…
        </Button>
        {hasMore && (
          <Button variant="ghost" icon={List} onClick={() => go('choose_workspace')}>
            All Workspaces
          </Button>
        )}
      </div>
    </OnboardingScreen>
  );
}

/** Create workspace (Figma `7175:20087`). */
export function NewWorkspacePage({ go }: OnboardingPageProps) {
  const actions = useWorkspaceActions();
  return (
    <OnboardingScreen footer={<WhatsAWorkspace />}>
      <CreateWorkspaceForm
        variant="page"
        onCancel={() => go('welcome')}
        // shown the same way as a failed open from Welcome
        onFailure={actions.show}
      />
    </OnboardingScreen>
  );
}

/** Choose workspace: every workspace, page by page. */
export function ChooseWorkspacePage({ go }: OnboardingPageProps) {
  const { trpc } = useServices();
  const actions = useWorkspaceActions();
  const pages = useInfiniteQuery(
    trpc.workspaces.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
  );
  const workspaces = (pages.data?.pages ?? []).flatMap((page) => page.items).sort(byLastOpened);

  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="Choose a workspace"
      description="Open one of your workspaces, or add one from a folder."
      footer={<WhatsAWorkspace />}
    >
      {workspaces.length > 0 ? (
        <WorkspacePicker
          label="Workspaces"
          workspaces={workspaces}
          onOpen={actions.open}
          disabled={actions.pending}
        />
      ) : (
        !pages.isPending && <Text tone="muted">No workspaces yet.</Text>
      )}
      {pages.hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => void pages.fetchNextPage()}
          disabled={pages.isFetchingNextPage}
        >
          Show More
        </Button>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => go('welcome')}>
          Back
        </Button>
        <Button icon={Folder} onClick={actions.openFolder} disabled={actions.pending}>
          Open Existing Folder…
        </Button>
      </div>
    </OnboardingScreen>
  );
}
