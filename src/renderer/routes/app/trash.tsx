import { createFileRoute } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { PlaceholderPage } from '../../app/pages';
import { trashSearch } from '../../pages/trash/search';

export const Route = createFileRoute('/app/trash')({
  validateSearch: trashSearch,
  component: () => <PlaceholderPage crumbs={['Trash']} icon={Trash2} />,
});
