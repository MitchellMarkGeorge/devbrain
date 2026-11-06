import { createFileRoute } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { PlaceholderPage } from '../app/pages';
import { notesSearch } from '../pages/notes/search';

export const Route = createFileRoute('/app/notes/')({
  validateSearch: notesSearch,
  component: () => <PlaceholderPage crumbs={['Notes']} icon={FileText} />,
});
