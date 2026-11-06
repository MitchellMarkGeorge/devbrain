import { useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { CircleAlert, Construction, SearchX, type LucideIcon } from 'lucide-react';
import { Breadcrumb, Button, EmptyState, PageContent, PageHeader } from '../components';
import { PageHeaderPortal } from './page-header';

/**
 * A page still to build: its header and a note saying so. Each `/app/*` route renders one until
 * its milestone replaces it (docs/renderer/implementation-plan.md).
 */
export function PlaceholderPage({
  crumbs,
  icon = Construction,
}: {
  crumbs: string[];
  icon?: LucideIcon;
}) {
  return (
    <PageContent>
      <PageHeaderPortal>
        <PageHeader>
          <Breadcrumb items={crumbs} />
        </PageHeader>
      </PageHeaderPortal>
      <EmptyState
        icon={icon}
        title={`${crumbs[0]} is on its way`}
        description="This page isn’t built yet."
      />
    </PageContent>
  );
}

/** A location with no page, or a detail page for something that no longer exists. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageContent>
      <PageHeaderPortal>
        <PageHeader />
      </PageHeaderPortal>
      <EmptyState
        icon={SearchX}
        title="Nothing here"
        description="It may have been deleted, or the link is out of date."
        action={
          <Button size="sm" onClick={() => void navigate({ to: '/app' })}>
            Go Home
          </Button>
        }
      />
    </PageContent>
  );
}

/** A route that failed to load. */
export function RouteErrorPage({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <PageContent>
      <PageHeaderPortal>
        <PageHeader />
      </PageHeaderPortal>
      <EmptyState
        icon={CircleAlert}
        title="This page couldn’t load"
        description="Something went wrong. Try again."
        action={
          <Button
            size="sm"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Retry
          </Button>
        }
      />
    </PageContent>
  );
}
