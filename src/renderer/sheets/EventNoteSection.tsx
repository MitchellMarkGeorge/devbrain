import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FileText, Link2 } from 'lucide-react';
import type { NoteId } from '@common/ids';
import type { Event } from '@common/types';
import {
  AddSlot,
  Button,
  DetailSection,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSearch,
  DropdownMenuTrigger,
  TaskNoteCard,
  useFormat,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import type { SheetNavigation } from './types';
import { noteTasksQuery, tasksSummary } from '@renderer/features/notes/api/queries';
import { useNoteActions } from '@renderer/features/notes/hooks/use-note-actions';
import {
  PickerEmpty,
  PickerSearchFilter,
  PickerTitle,
  pickerRows,
  usePickerSearch,
} from '@renderer/features/search/components/picker-search';

/** The event's note: the note whose `linkedEventId` is the event (one at most is shown). */
export function eventNoteQuery(eventId: Event['id']) {
  return trpc.notes.list.queryOptions({ filter: { linkedEventId: eventId }, limit: 1 });
}

/**
 * The event sheet's Event note (Figma `7175:30140`, `7175:30868`): the note's card (its title,
 * its tasks, when it was edited), opening the note in the sheet (`NoteSheet`, with the meeting
 * over it), where the meeting's notes are taken beside the calendar. With none yet: "+ Add a
 * note" starts one named after the event and opens it with the caret in its body, as "Add a task
 * note" does on a task, and "Link" makes an existing note the event's.
 */
export function EventNoteSection({
  event,
  occurrence,
  sheet,
}: {
  event: Pick<Event, 'id' | 'title'>;
  /** the occurrence the sheet shows, which the note's strip then names */
  occurrence?: Date;
  /** the sheet it is drawn in: to show a linked item in it, or close it */
  sheet: SheetNavigation;
}) {
  const { formatDate } = useFormat();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast('Couldn’t start the note');
  const [starting, setStarting] = useState(false);
  const notes = useQuery(eventNoteQuery(event.id));
  const note = notes.data?.items[0];
  const tasks = useInfiniteQuery({
    ...noteTasksQuery(note?.id ?? ('nte_none' as never)),
    enabled: note !== undefined,
  });
  const statuses = tasks.data?.pages.flatMap((page) => page.items.map((task) => task.status));

  // in this sheet where the page's shows notes (the calendar), else on the note's page
  const open = (id: NoteId, created = false) =>
    sheet.accepts(id)
      ? sheet.show(id, { occurrence: occurrence?.toISOString(), created })
      : openEntity({ id });

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const created = await ipc.notes.create.mutate({
        title: `${event.title} notes`,
        linkedEventId: event.id,
      });
      open(created.id, true);
    } catch (error) {
      showError(error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <DetailSection
      title="Event note"
      action={!note && notes.isSuccess ? <LinkNotePicker event={event} /> : undefined}
      data-testid="event-note"
    >
      {note ? (
        <TaskNoteCard
          title={note.title || 'Untitled'}
          updated={formatDate(note.updatedAt)}
          tasksSummary={tasksSummary(statuses ?? [])}
          layout="stacked"
          onOpen={() => open(note.id)}
        />
      ) : (
        notes.isSuccess && (
          <AddSlot disabled={starting} onClick={() => void start()}>
            Add a note
          </AddSlot>
        )
      )}
    </DetailSection>
  );
}

/**
 * Link: a note edited lately, or any note matching what is typed, becomes the event's note.
 */
function LinkNotePicker({ event }: { event: Pick<Event, 'id'> }) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSearchFilter>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button size="xs" icon={Link2} aria-label="Link an existing note">
              Link
            </Button>
          }
        />
        <DropdownMenuContent width="lg" align="end">
          <DropdownMenuSearch aria-label="Search notes" placeholder="Link a note…" />
          <LinkNoteItems event={event} enabled={open} />
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

const NOTE_TYPES = ['note'] as const;

// Link's rows: the 50 notes edited last while nothing is typed, else what search finds
function LinkNoteItems({ event, enabled }: { event: Pick<Event, 'id'>; enabled: boolean }) {
  const actions = useNoteActions();
  const notes = useQuery({
    ...trpc.notes.list.queryOptions({
      sort: { sortBy: 'updatedAt', direction: 'desc' },
      limit: 50,
    }),
    enabled,
  });
  const search = usePickerSearch(NOTE_TYPES);
  return (
    <>
      <DropdownMenuList>
        {pickerRows(search.results, notes.data?.items ?? []).map((row) => (
          <DropdownMenuItem
            key={row.entity.id}
            icon={FileText}
            label={row.entity.title || 'Untitled'}
            onClick={() => actions.setLink(row.entity, { linkedEventId: event.id })}
          >
            <PickerTitle row={row} title={row.entity.title} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <PickerEmpty searching={search.searching}>No notes match</PickerEmpty>
    </>
  );
}
