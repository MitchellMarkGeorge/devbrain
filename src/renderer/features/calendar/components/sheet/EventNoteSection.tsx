import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Event } from '@common/types';
import { AddSlot, DetailSection, TaskNoteCard, useFormat } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { noteTasksQuery, tasksSummary } from '@renderer/features/notes/api/queries';

/** The event's note: the note whose `linkedEventId` is the event (one at most is shown). */
export function eventNoteQuery(eventId: Event['id']) {
  return trpc.notes.list.queryOptions({ filter: { linkedEventId: eventId }, limit: 1 });
}

/**
 * The event sheet's Event note (Figma `7175:30140`, `7175:30868`): the note's card (its title,
 * its tasks, when it was edited), or "+ Add a note". Either opens the note in the sheet itself
 * (`EventNoteView`), where the meeting's notes are taken beside the calendar.
 */
export function EventNoteSection({
  event,
  onOpenNote,
}: {
  event: Pick<Event, 'id'>;
  onOpenNote: () => void;
}) {
  const { formatDate } = useFormat();
  const notes = useQuery(eventNoteQuery(event.id));
  const note = notes.data?.items[0];
  const tasks = useInfiniteQuery({
    ...noteTasksQuery(note?.id ?? ('nte_none' as never)),
    enabled: note !== undefined,
  });
  const statuses = tasks.data?.pages.flatMap((page) => page.items.map((task) => task.status));
  return (
    <DetailSection title="Event note" data-testid="event-note">
      {note ? (
        <TaskNoteCard
          title={note.title || 'Untitled'}
          updated={formatDate(note.updatedAt)}
          tasksSummary={tasksSummary(statuses ?? [])}
          layout="stacked"
          onOpen={onOpenNote}
        />
      ) : (
        notes.isSuccess && <AddSlot onClick={onOpenNote}>Add a note</AddSlot>
      )}
    </DetailSection>
  );
}
