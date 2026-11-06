import { createFileRoute } from '@tanstack/react-router';
import { Calendar } from 'lucide-react';
import { PlaceholderPage } from '../../app/pages';
import { calendarSearch } from '../../pages/calendar/search';

export const Route = createFileRoute('/app/calendar')({
  validateSearch: calendarSearch,
  component: () => <PlaceholderPage crumbs={['Calendar']} icon={Calendar} />,
});
