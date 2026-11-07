import { createFileRoute } from '@tanstack/react-router';
import { CalendarPage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/calendar')({
  staticData: { title: 'Calendar' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.calendar()),
  component: CalendarPage,
});
