import { useSuspenseQuery } from '@tanstack/react-query';
import { Calendar, FileText, Folder, House, Settings, Trash2, Zap } from 'lucide-react';
import { trpc } from '../../ipc';
import { PlaceholderPage } from './PlaceholderPage';

// The workspace's pages until their milestones build them: each loads its real data through its
// route's loader (which primes these queries) and lists it. Exported as query factories so the
// route and the page read the same cache entry.

export const pageQueries = {
  home: () => trpc.recents.list.queryOptions({ limit: 10 }),
  projects: () => trpc.projects.list.queryOptions({ limit: 50 }),
  notes: () => trpc.notes.list.queryOptions({ limit: 50 }),
  calendar: () => trpc.calendars.list.queryOptions(),
  integrations: () => trpc.integrations.list.queryOptions(),
  trash: () => trpc.archive.listArchived.queryOptions({ limit: 50 }),
  settings: () => trpc.settings.get.queryOptions(),
};

export function HomePage() {
  const { data } = useSuspenseQuery(pageQueries.home());
  return (
    <PlaceholderPage
      icon={House}
      empty="Nothing opened yet"
      rows={data.items.map(({ entity }) => ({ id: entity.id, title: entity.title }))}
    />
  );
}

export function ProjectsPage() {
  const { data } = useSuspenseQuery(pageQueries.projects());
  return <PlaceholderPage icon={Folder} empty="No projects yet" rows={data.items} />;
}

export function NotesPage() {
  const { data } = useSuspenseQuery(pageQueries.notes());
  return <PlaceholderPage icon={FileText} empty="No notes yet" rows={data.items} />;
}

export function CalendarPage() {
  const { data } = useSuspenseQuery(pageQueries.calendar());
  return (
    <PlaceholderPage
      icon={Calendar}
      empty="No calendars yet"
      rows={data.map(({ id, name }) => ({ id, title: name }))}
    />
  );
}

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
