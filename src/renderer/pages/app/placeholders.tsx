import { useSuspenseQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { trpc } from '../../ipc';
import { PlaceholderPage } from './PlaceholderPage';

// The workspace's pages until their milestones build them: each loads its real data through its
// route's loader (which primes these queries) and lists it. Exported as query factories so the
// route and the page read the same cache entry.

export const pageQueries = {
  integrations: () => trpc.integrations.list.queryOptions(),
};

export function IntegrationsPage() {
  const { data } = useSuspenseQuery(pageQueries.integrations());
  return (
    <PlaceholderPage
      icon={Zap}
      empty="No accounts connected"
      rows={data.map(({ id, provider, accountLabel }) => ({
        id,
        title: `${provider}: ${accountLabel}`,
      }))}
    />
  );
}
