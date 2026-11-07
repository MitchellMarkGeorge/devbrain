import { Link } from '@tanstack/react-router';
import { Button, Logomark, OnboardingScreen } from '../../components';

/** A URL outside onboarding and the workspaces: no page there. */
export function NotFoundScreen() {
  return (
    <OnboardingScreen
      logo={<Logomark size="md" />}
      title="There’s no page here"
      description="The link may be out of date."
    >
      <Button render={<Link to="/" />} nativeButton={false}>
        Go to DevBrain
      </Button>
    </OnboardingScreen>
  );
}
