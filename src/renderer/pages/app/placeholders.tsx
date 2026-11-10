import { useSuspenseQuery } from '@tanstack/react-query';
import { Settings, Trash2, Zap } from 'lucide-react';
import { trpc } from '../../ipc';
import { PlaceholderPage } from './PlaceholderPage';

// The workspace's pages until their milestones build them: each loads its real data through its
// route's loader (which primes these queries) and lists it. Exported as query factories so the
// route and the page read the same cache entry.

export const pageQueries = {
  integrations: () => trpc.integrations.list.queryOptions(),
  trash: () => trpc.archive.listArchived.queryOptions({ limit: 50 }),
  settings: () => trpc.settings.get.queryOptions(),
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

export function TrashPage() {
  const { data } = useSuspenseQuery(pageQueries.trash());
  return <PlaceholderPage icon={Trash2} empty="Trash is empty" rows={data.items} />;
}

export function SettingsPage() {
  const { data } = useSuspenseQuery(pageQueries.settings());
  return (
    <PlaceholderPage
      icon={Settings}
      empty="No settings"
      rows={[
        { id: 'landing', title: `Start page: ${data.general.defaultLandingPage}` },
        { id: 'last', title: `Reopen last page: ${data.general.openToLastPage ? 'on' : 'off'}` },
        { id: 'theme', title: `Theme: ${data.theme}` },
      ]}
    />
  );
}
