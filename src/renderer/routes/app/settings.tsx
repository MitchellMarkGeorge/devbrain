import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { PlaceholderPage } from '../../app/pages';
import { settingsSearch } from '../../pages/settings/search';

export const Route = createFileRoute('/app/settings')({
  validateSearch: settingsSearch,
  component: () => <PlaceholderPage crumbs={['Settings']} icon={Settings} />,
});
