import { useState } from 'react';
import type { SerializedError } from '@common/ipc/types';
import {
  ChooseWorkspacePage,
  NewWorkspacePage,
  WelcomePage,
  type OnboardingScreenName,
} from '../pages/onboarding/OnboardingPages';
import {
  WorkspaceActionsProvider,
  WorkspaceErrorDialog,
} from '../pages/onboarding/WorkspaceErrorDialog';

/**
 * The window while no workspace is open: Welcome, Create workspace or Choose workspace, with the
 * workspace actions and their error dialog around them. Three screens with no back or forward, so
 * a piece of state picks the screen; no router. Mounted afresh each time onboarding comes back
 * (WindowContent keys it), so it starts at Welcome. `error` is why the last open failed.
 */
export function OnboardingApp({ error }: { error: SerializedError | null }) {
  const [screen, setScreen] = useState<OnboardingScreenName>('welcome');
  return (
    <WorkspaceActionsProvider initialFailure={error}>
      {screen === 'welcome' && <WelcomePage go={setScreen} />}
      {screen === 'new_workspace' && <NewWorkspacePage go={setScreen} />}
      {screen === 'choose_workspace' && <ChooseWorkspacePage go={setScreen} />}
      <WorkspaceErrorDialog />
    </WorkspaceActionsProvider>
  );
}
