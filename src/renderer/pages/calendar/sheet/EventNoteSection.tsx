import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2 } from 'lucide-react';
import type { Event, NoteListItem } from '@common/types';
import { AddSlot, Button, DetailSection } from '../../../components';
import { ipc, trpc } from '../../../ipc';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { useOpenEntity } from '../../app/use-open-entity';
import { NoteEditor } from '../../notes/detail/NoteEditor';
import styles from './EventSheet.module.css';

/**
 * The event note (the note whose `linkedEventId` is the event, Figma `7175:30140`, `7410:34948`):
 * edited in place in the sheet with the note page's `NoteEditor`, saved as you type, with "Open full view" to the note's page; or
 * "+ Add a note", which creates one named after the event. A synced event can have one too.
 */
export function EventNoteSection({ event }: { event: Pick<Event, 'id' | 'title'> }) {
  const showError = useMutationErrorToast('Couldn’t add a note');
  const [creating, setCreating] = useState(false);
  const notes = useQuery(
    trpc.notes.list.queryOptions({ filter: { linkedEventId: event.id }, limit: 1 }),
  );
  const note = notes.data?.items[0];

  async function create() {
    setCreating(true);
    try {
      await ipc.notes.create.mutate({ title: `${event.title} notes`, linkedEventId: event.id });
    } catch (error) {
      showError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <DetailSection
      title="Event note"
      action={note && <OpenFullView note={note} />}
      data-testid="event-note"
    >
      {note ? (
        <div className={styles.editor}>
          <NoteEditor key={note.id} noteId={note.id} />
        </div>
      ) : (
        notes.isSuccess && (
          <AddSlot disabled={creating} onClick={() => void create()}>
            Add a note
          </AddSlot>
        )
      )}
    </DetailSection>
  );
}

function OpenFullView({ note }: { note: Pick<NoteListItem, 'id'> }) {
  const openEntity = useOpenEntity();
  return (
    <Button size="xs" variant="ghost" icon={Maximize2} onClick={() => openEntity({ id: note.id })}>
      Open full view
    </Button>
  );
}
