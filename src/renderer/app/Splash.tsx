import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Flex, Icon, Logomark, OnboardingScreen, Text } from '../components';
import { useServices } from './context';

/**
 * The window while a workspace opens (Figma `7175:19848`): the pulsing mark, "Opening ‹name›…" and
 * the app's version. The window draws it whenever the workspace state is `opening`: at startup
 * and during a switch alike, held at least `SPLASH_MINIMUM_MS` (workspace-state.ts).
 */
export function Splash({ name }: { name?: string | null }) {
  const { trpc } = useServices();
  const version = useQuery(trpc.app.version.queryOptions());
  return (
    <OnboardingScreen
      role="status"
      aria-label={name ? `Opening ${name}` : 'Opening DevBrain'}
      logo={<Logomark size="lg" pulse />}
      description={name ? `Opening ${name}…` : undefined}
      footer={
        version.data ? (
          <Text size="xs" tone="subtle">
            Version {version.data}
          </Text>
        ) : undefined
      }
    />
  );
}

/**
 * The window when DevBrain itself could not load (its data folder): nothing that needs it can
 * run, so the window draws this instead of anything else.
 */
export function DevBrainUnavailable() {
  return (
    <OnboardingScreen
      role="alert"
      logo={<Logomark size="md" />}
      title="DevBrain couldn’t open its data folder"
      description="Check that the folder exists and that DevBrain can read and write it, then restart DevBrain."
      footer={
        <Flex gap="1" align="center">
          <Icon icon={TriangleAlert} size={12} />
          <Text size="xs" tone="subtle">
            The log file says what went wrong.
          </Text>
        </Flex>
      }
    />
  );
}
