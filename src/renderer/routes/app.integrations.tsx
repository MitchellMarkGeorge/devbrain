import { createFileRoute } from '@tanstack/react-router';
import { Zap } from 'lucide-react';
import { PlaceholderPage } from '../app/pages';

export const Route = createFileRoute('/app/integrations')({
  component: () => <PlaceholderPage crumbs={['Integrations']} icon={Zap} />,
});
