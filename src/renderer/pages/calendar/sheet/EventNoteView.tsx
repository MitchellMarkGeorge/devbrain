import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { FileText, Link2, Video } from 'lucide-react';
import type { NoteId } from '@common/ids';
import type { Event, Note } from '@common/types';
import {
  Button,
  ColourBar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSearch,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Stack,
  Text,
  useFormat,
} from '../../../components';
import { eventCountdown } from '../../../components/event-text';
import { ipc, trpc } from '../../../ipc';
import { useCommands } from '../../../keyboard';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { NoteEditor } from '../../notes/detail/NoteEditor';
import { useNoteActions } from '../../notes/use-note-actions';
import { PickerSearchFilter, ResultItem, usePickerSearch } from '../../search/picker-search';
import { eventNoteQuery } from './EventNoteSection';
import type { ShownTiming } from './timing';
import styles from './EventSheet.module.css';

export interface EventNoteViewProps {
  event: Event;
  /** the occurrence shown: its start and end, for the strip's countdown and times */
  shown: ShownTiming;
  /** the colour bar's: the event's own, or its calendar's */
  color: string | undefined;
}

/**
 * The event's note in the sheet (Figma `7410:34948`): a strip naming the meeting (its colour,
 * title, how soon, its times and place, Join), then the note itself, its title and its body in the
 * note page's `NoteEditor`, saved as you type, so a meeting's notes are taken beside the calendar.
 * With no note yet (`7411:34597`): Start Note (or N), or Link Existing Note.
 */
export function EventNoteView({ event, shown, color }: EventNoteViewProps) {
  const notes = useQuery(eventNoteQuery(event.id));
  const note = notes.data?.items[0];
  // a note just started takes the caret at once
  const [started, setStarted] = useState(false);
  return (
    <div className={styles.noteView} data-testid="event-note-view">
      <EventStrip event={event} shown={shown} color={color} />
      <div className={styles.noteBody}>
        {note ? (
          <EventNote key={note.id} noteId={note.id} focus={started} />
        ) : notes.isPending ? (
          <Stack gap="3" aria-busy>
            <Skeleton height={28} width="60%" />
            <Skeleton height={16} width="90%" />
          </Stack>
        ) : (
          <NoNote event={event} onStarted={() => setStarted(true)} />
        )}
      </div>
    </div>
  );
}

/** The bar under the sheet while it shows a note (Figma `7410:34948`). */
export function EventNoteFooter() {
  return (
    <div className={styles.noteFooter}>
      <span>Type / for blocks</span>
      <span>Notes save as you type</span>
    </div>
  );
}

/** The meeting the note is for: "Mitchell / Jesse 1:1", "Now · 10:30 – 11:00 AM · Room 2A", Join. */
function EventStrip({ event, shown, color }: EventNoteViewProps) {
  const format = useFormat('minute');
  const openUrl = useMutation(trpc.workspace.openUrl.mutationOptions());
  const countdown = eventCountdown(
    { startAt: shown.start, endAt: shown.end, allDay: shown.allDay },
    format,
  );
  const times = shown.allDay
    ? 'All day'
    : `${format.formatTime(shown.start)} – ${format.formatTime(shown.end)}`;
  return (
    <div className={styles.strip}>
      <ColourBar color={color} height={36} />
      <div className={styles.stripText}>
        <span className={styles.stripTitle}>{event.title}</span>
        <span className={styles.stripMeta}>
          <span className={countdown.tone === 'soon' ? styles.soon : undefined}>
            {countdown.text}
          </span>
          {' · '}
          {times}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </div>
      {event.meetingUrl && (
        <Button size="xs" icon={Video} onClick={() => openUrl.mutate({ url: event.meetingUrl! })}>
          Join
        </Button>
      )}
    </div>
  );
}

// the note: its title, edited in place, when it was saved, and its body
function EventNote({ noteId, focus }: { noteId: Note['id']; focus: boolean }) {
  const note = useQuery(trpc.notes.get.queryOptions({ id: noteId })).data;
  const { formatRelative } = useFormat('minute');
  if (!note) return <Skeleton height={28} width="60%" />;
  return (
    <>
      <Stack gap="1">
        <NoteTitle key={note.title} note={note} />
        <Text size="xs" tone="subtle">
          Saved {formatRelative(note.updatedAt).toLowerCase()}
        </Text>
      </Stack>
      <div className={styles.noteEditor}>
        <NoteEditor
          noteId={note.id}
          onReady={focus ? (editor: Editor) => editor.commands.focus('end') : undefined}
        />
      </div>
    </>
  );
}

// the note's title, saved on Enter or when it loses focus
function NoteTitle({ note }: { note: Note }) {
  const actions = useNoteActions();
  const [title, setTitle] = useState(note.title);
  const save = () => {
    const next = title.trim();
    if (next !== note.title) actions.rename(note, next);
  };
  return (
    <input
      className={styles.noteTitle}
      aria-label="Note title"
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
  );
}

// no note yet: start one named after the event (N does too, while this shows), or link one
function NoNote({ event, onStarted }: { event: Event; onStarted: () => void }) {
  const showError = useMutationErrorToast('Couldn’t start the note');
  const [starting, setStarting] = useState(false);
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await ipc.notes.create.mutate({ title: `${event.title} notes`, linkedEventId: event.id });
      onStarted();
    } catch (error) {
      showError(error);
    } finally {
      setStarting(false);
    }
  };
  // N, which makes a new note anywhere else, starts this meeting's note here
  useCommands([
    { id: 'note.new', title: 'Start a note for this event', scope: 'global', run: start },
  ]);
  return (
    <div className={styles.noNote}>
      <EmptyState
        icon={FileText}
        title="No note for this meeting yet"
        description="Take notes while the meeting happens. The note stays linked to this event, and you can open it in the full editor any time."
        action={
          <div className={styles.noNoteActions}>
            <Button size="sm" icon={FileText} disabled={starting} onClick={() => void start()}>
              Start Note
            </Button>
            <LinkNotePicker event={event} />
          </div>
        }
      />
      <Text size="xs" tone="subtle">
        or press N
      </Text>
    </div>
  );
}

/**
 * Link Existing Note: a note edited lately, or one search finds once something is typed, becomes
 * the event's note.
 */
function LinkNotePicker({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSearchFilter>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" icon={Link2}>
              Link Existing Note
            </Button>
          }
        />
        <DropdownMenuContent width="lg" align="center">
          <DropdownMenuSearch aria-label="Search notes" placeholder="Link a note…" />
          <LinkNoteItems event={event} enabled={open} />
          <DropdownMenuEmpty>No notes match</DropdownMenuEmpty>
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

const NOTE_TYPES = ['note'] as const;

function LinkNoteItems({ event, enabled }: { event: Event; enabled: boolean }) {
  const actions = useNoteActions();
  const search = usePickerSearch(NOTE_TYPES);
  const notes = useQuery({
    ...trpc.notes.list.queryOptions({
      sort: { sortBy: 'updatedAt', direction: 'desc' },
      limit: 50,
    }),
    enabled,
  });
  const link = (note: { id: string; title: string }) =>
    actions.setLink({ id: note.id as NoteId, title: note.title }, { linkedEventId: event.id });
  return (
    <DropdownMenuList>
      {search.results
        ? search.results.map((row) => (
            <ResultItem key={row.id} row={row} onClick={() => link(row)} />
          ))
        : notes.data?.items
            .filter((note) => search.matches(note.title || 'Untitled'))
            .map((note) => (
              <DropdownMenuItem key={note.id} icon={FileText} onClick={() => link(note)}>
                {note.title || 'Untitled'}
              </DropdownMenuItem>
            ))}
    </DropdownMenuList>
  );
}
