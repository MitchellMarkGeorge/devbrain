import { Link } from '@tanstack/react-router';
import { Button, Logomark, AppShell } from '../../components';

/** A URL outside onboarding and the workspaces: no page there. */
export function NotFoundScreen() {
  return (
    <AppShell
      logo={<Logomark size="md" />}
      title="There’s no page here"
      description="The link may be out of date."
    >
      <Button render={<Link to="/" />} nativeButton={false}>
        Go to DevBrain
      </Button>
    </AppShell>
  );
}
