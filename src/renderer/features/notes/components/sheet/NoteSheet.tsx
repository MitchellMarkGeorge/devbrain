import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import type { Editor } from '@tiptap/react';
import { ChevronLeft } from 'lucide-react';
import type { NoteId } from '@common/ids';
import type { Note, NoteListItem } from '@common/types';
import {
  Button,
  SheetBody,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
  Skeleton,
  Stack,
  Text,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { useSheetNavigation } from '@renderer/shared/hooks/use-sheet';
import { EventStrip } from '@renderer/features/calendar/components/sheet/EventStrip';
import { ProjectPill } from '@renderer/features/tasks/components/menus/pickers';
import { ItemMentionsSection } from '@renderer/shared/components/ItemMentions';
import { NoteEditor } from '../detail/NoteEditor';
import { useNoteActions } from '../../hooks/use-note-actions';
import styles from './NoteSheet.module.css';

export interface NoteSheetProps {
  noteId: NoteId;
  /** for the note of a repeating event, opened from one occurrence: that occurrence's start (ISO) */
  occurrence?: string;
}

/**
 * A note in the sheet beside a page (`?sheet=nte_…`): a task page's task note, and on the
 * calendar an event's note (Figma `7410:34948`). Its title, "Edited …", its project, and its body
 * in the rich text editor, saved as it's typed as on the note's page; its ⤢ opens that page.
 *
 * The note of an event is the same sheet with the meeting over it: a strip naming the event (how
 * soon, its times and place, Join), "Type / for blocks · Notes save as you type" under the body,
 * and, where the page's sheet shows events (the calendar), "‹ Event" back to the event.
 */
export function NoteSheet({ noteId, occurrence }: NoteSheetProps) {
  const openEntity = useOpenEntity();
  const sheet = useSheetNavigation();
  const query = useQuery(trpc.notes.get.queryOptions({ id: noteId }));
  const note = query.data && query.data.archivedAt === null ? query.data : undefined;
  const eventId = note?.linkedEventId ?? null;

  return (
    <>
      <SheetHeader onOpenAsPage={query.data ? () => openEntity({ id: noteId }) : undefined}>
        {eventId && sheet.accepts(eventId) ? (
          <Button
            size="xs"
            variant="ghost"
            icon={ChevronLeft}
            onClick={() => sheet.show(eventId, { occurrence })}
          >
            Event
          </Button>
        ) : (
          'Note'
        )}
      </SheetHeader>
      <SheetBody>
        {note ? (
          <NoteSheetBody key={note.id} note={note} occurrence={occurrence} />
        ) : query.isError || query.data ? (
          <Text tone="muted">
            {query.data || ipcErrorCode(query.error) === 'not_found'
              ? 'This note was deleted, or moved to the trash.'
              : 'This note couldn’t be loaded.'}
          </Text>
        ) : (
          <Stack gap="3" aria-busy>
            <Skeleton height={20} width="70%" />
            <Skeleton height={16} width="40%" />
            <Skeleton height={16} width="90%" />
          </Stack>
        )}
      </SheetBody>
      {eventId && (
        <div className={styles.footer}>
          <span>Type / for blocks</span>
          <span>Notes save as you type</span>
        </div>
      )}
    </>
  );
}

// the title, edited in place: saved on Enter or when it loses focus
function SheetTitle({ note }: { note: Note }) {
  const actions = useNoteActions();
  const [title, setTitle] = useState(note.title);
  const save = () => {
    const next = title.trim();
    if (next !== note.title) actions.rename(note, next);
  };
  return (
    <SheetItemTitle>
      <input
        className={styles.titleInput}
        aria-label="Title"
        placeholder="Untitled"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        onBlur={save}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape' && title !== note.title) {
            event.stopPropagation();
            setTitle(note.title);
          }
        }}
      />
    </SheetItemTitle>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The sheet's body for a loaded note. */
function NoteSheetBody({ note, occurrence }: { note: NoteListItem; occurrence?: string }) {
  const actions = useNoteActions();
  const { formatRelative } = useFormat('minute');
  // a note just started (an event's "+ Add a note") takes the caret at once
  const created = useRouterState({ select: (state) => state.location.state.newNote === true });
  return (
    <>
      {note.linkedEventId && (
        <EventStrip
          eventId={note.linkedEventId}
          occurrence={occurrence ? new Date(occurrence) : undefined}
        />
      )}
      <Stack gap="1">
        <SheetTitle key={note.title} note={note} />
        <Text size="xs" tone="subtle">
          Edited {lowerFirst(formatRelative(note.updatedAt))}
        </Text>
      </Stack>
      <div className={styles.pills}>
        <ProjectPill
          value={note.project}
          placeholder="Add to project"
          onChange={(project) => actions.setProject([note], project?.id ?? null)}
        />
      </div>
      <SheetDivider />
      <div className={styles.body}>
        <NoteEditor
          noteId={note.id}
          onReady={created ? (editor: Editor) => editor.commands.focus('end') : undefined}
        />
      </div>
      <ItemMentionsSection targetId={note.id} />
    </>
  );
}
