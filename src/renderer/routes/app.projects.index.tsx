import { createFileRoute } from '@tanstack/react-router';
import { Folder } from 'lucide-react';
import { PlaceholderPage } from '../app/pages';
import { projectsSearch } from '../pages/projects/search';

export const Route = createFileRoute('/app/projects/')({
  validateSearch: projectsSearch,
  component: () => <PlaceholderPage crumbs={['Projects']} icon={Folder} />,
});
