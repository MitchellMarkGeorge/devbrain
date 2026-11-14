import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { Button, EmptyState, PageContent, Page } from '@renderer/components';
import { ipcErrorOf } from '@renderer/shared/lib/workspace/errors';

/** A page whose loader or render failed, in the shell: what went wrong, and Retry. */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = ipcErrorOf(error)?.message ?? 'Something went wrong.';
  return (
    <Page>
      <PageContent>
        <EmptyState
          icon={TriangleAlert}
          title="This page couldn’t be loaded"
          description={message}
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
    </Page>
  );
}
