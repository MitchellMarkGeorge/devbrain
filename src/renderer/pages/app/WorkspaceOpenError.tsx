import {
  useCanGoBack,
  useNavigate,
  useParams,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, LayoutList, RotateCw, ScrollText } from 'lucide-react';
import { Button, Logomark, OnboardingScreen } from '../../components';
import { trpc } from '../../ipc';
import { ipcErrorCode, openFailure } from '../../workspace/errors';
import styles from '../onboarding/Onboarding.module.css';

/**
 * The workspace the URL names couldn't be opened (the /app/$workspaceId route's error): why, by
 * core's error code, and the way back. When the open failed before anything closed (a missing
 * folder, an unknown workspace), the workspace open before still is, and Go Back returns to it;
 * when it failed after (a migration), none is open, and Choose a Workspace goes to onboarding.
 */
export function WorkspaceOpenError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { workspaceId } = useParams({ strict: false });
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const showLogFile = useMutation(trpc.app.showLogFile.mutationOptions());
  const name = list.data?.items.find((workspace) => workspace.id === workspaceId)?.name ?? null;
  const copy = openFailure(error, name);
  const code = ipcErrorCode(error);
  const openId = useQuery(trpc.workspaces.current.queryOptions()).data?.id ?? null;
  const openName = list.data?.items.find((workspace) => workspace.id === openId)?.name;

  const goBack = () => {
    if (canGoBack) router.history.back();
    else if (openId) void navigate({ to: '/app/$workspaceId', params: { workspaceId: openId } });
  };

  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title={copy.title}
      description={copy.description}
      data-testid="workspace-open-error"
      data-error-code={code}
    >
      <div className={styles.actions}>
        {openId && openId !== workspaceId ? (
          <Button icon={ArrowLeft} onClick={goBack}>
            {openName ? `Back to ${openName}` : 'Go Back'}
          </Button>
        ) : (
          <Button icon={LayoutList} onClick={() => void navigate({ to: '/onboarding' })}>
            Choose a Workspace
          </Button>
        )}
        {code === 'workspace_migration' || code === 'internal' ? (
          <Button icon={ScrollText} onClick={() => showLogFile.mutate()}>
            Show Log File
          </Button>
        ) : (
          code !== 'not_found' && (
            <Button icon={RotateCw} variant="ghost" onClick={() => void router.invalidate()}>
              Try Again
            </Button>
          )
        )}
      </div>
    </OnboardingScreen>
  );
}
