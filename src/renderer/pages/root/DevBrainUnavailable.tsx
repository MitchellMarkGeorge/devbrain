import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { Button, Logomark, OnboardingScreen } from '../../components';

/**
 * The whole window when main couldn't load DevBrain (the initial load context's
 * `devBrainAvailable: false`): nothing else can run, so no route renders. The log says why.
 */
export function DevBrainUnavailable() {
  const { trpc } = useRouter().options.context;
  const showLog = useMutation(trpc.app.showLogFile.mutationOptions());
  return (
    <OnboardingScreen
      data-devbrain-unavailable=""
      logo={<Logomark size="md" />}
      title="DevBrain couldn’t open its data folder"
      description="Something went wrong loading your DevBrain folder, so nothing can be shown. The log file says what happened."
    >
      <Button icon={FileText} onClick={() => showLog.mutate()} disabled={showLog.isPending}>
        Show Log File
      </Button>
    </OnboardingScreen>
  );
}
