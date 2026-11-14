import { Link, useParams } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';
import { Button, EmptyState, PageContent } from '@renderer/components';

/** A URL in a workspace with no page behind it: a page that doesn't exist, or a deleted entity's. */
export function NotFoundPage() {
  const { workspaceId } = useParams({ strict: false });
  return (
    <PageContent>
      <EmptyState
        icon={SearchX}
        title="There’s nothing here"
        description="It may have been deleted, or the link is out of date."
        action={
          workspaceId ? (
            <Button
              size="sm"
              render={<Link to="/app/$workspaceId" params={{ workspaceId }} />}
              nativeButton={false}
            >
              Go Home
            </Button>
          ) : (
            <Button size="sm" render={<Link to="/" />} nativeButton={false}>
              Go to DevBrain
            </Button>
          )
        }
      />
    </PageContent>
  );
}
