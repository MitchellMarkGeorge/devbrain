import { createFileRoute } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { PlaceholderPage } from '../app/pages';
import { tasksSearch } from '../pages/tasks/search';

export const Route = createFileRoute('/app/tasks/')({
  validateSearch: tasksSearch,
  component: () => <PlaceholderPage crumbs={['Tasks']} icon={CircleCheck} />,
});
