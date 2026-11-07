import { useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { CircleAlert, FileQuestion } from 'lucide-react';
import { Button, EmptyState, PageContent } from '../../components';
import { PageTitle } from '../shell/page-header';

/** A location that matches no route, or an entity that isn't there. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageContent layout="document" data-page="not-found">
      <PageTitle />
      <EmptyState
        icon={FileQuestion}
        title="This page doesn’t exist"
        description="It may have been deleted, or the link is out of date."
        action={<Button onClick={() => navigate({ to: '/' })}>Go Home</Button>}
      />
    </PageContent>
  );
}

/**
 * A route whose loader or component failed: say so, and offer to try again. Retry clears the error
 * boundary and reloads the route: `reset` alone would draw the page again without re-running its
 * loader.
 */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <PageContent layout="document" data-page="error">
      <PageTitle />
      <EmptyState
        icon={CircleAlert}
        title="This page couldn’t be loaded"
        description={error instanceof Error ? error.message : 'Something went wrong.'}
        action={
          <Button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Try Again
          </Button>
        }
      />
    </PageContent>
  );
}
