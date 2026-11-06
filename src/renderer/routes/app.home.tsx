import { createFileRoute } from '@tanstack/react-router';
import { House } from 'lucide-react';
import { PlaceholderPage } from '../app/pages';

export const Route = createFileRoute('/app/home')({
  component: () => <PlaceholderPage crumbs={['Home']} icon={House} />,
});
