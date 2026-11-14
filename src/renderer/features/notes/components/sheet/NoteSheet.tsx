import { useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import type { NoteId } from '@common/ids';
import type { Note } from '@common/types';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
  Skeleton,
  Stack,
  Text,
  useFormat,
  useWorkspaceShell,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { ProjectPill } from '@renderer/features/tasks/components/menus/pickers';
import { NoteEditor } from '../detail/NoteEditor';
import { useNoteActions } from '../../hooks/use-note-actions';
import styles from './NoteSheet.module.css';

declare module '@tanstack/history' {
  interface HistoryState {
    /** the page opened the note sheet with this entry: Back (and the sheet's close) goes back */
    openedNoteSheet?: boolean;
  }
}

export interface NoteSheetProps {
  noteId: NoteId;
  /** false while it slides out: the page keeps it mounted until `onClosed` */
  open: boolean;
  /** closes the sheet (removes its param from the URL) */
  onClose: () => void;
  /** it has finished sliding out, and can be unmounted */
  onClosed: () => void;
}

/**
 * A note in the docked sheet beside a page (a task page's task note, Figma's event note in the
 * sheet `7410:34948`): its title, "Edited …", its project, and its body in the rich text editor,
 * saved as it's typed as on the note's page. Its ⤢ opens the note's page. Floating in compact
 * windows. Closing goes back when the page pushed the sheet's entry, so Back and × agree.
 */
export function NoteSheet({ noteId, open, onClose, onClosed }: NoteSheetProps) {
  const router = useRouter();
  const { size, sheetContainer } = useWorkspaceShell();
  const floating = size === 'compact';
  const openEntity = useOpenEntity();
  const openedHere = useRouterState({ select: (state) => state.location.state.openedNoteSheet });
  const query = useQuery(trpc.notes.get.queryOptions({ id: noteId }));

  const close = () => {
    if (openedHere) router.history.back();
    else onClose();
  };

  // on a first render the shell hasn't mounted its column yet: the sheet joins it a moment later
  if (!floating && !sheetContainer) return null;
  return (
    <Sheet
      open={open}
      variant={floating ? 'overlay' : 'docked'}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed();
      }}
    >
      <SheetContent container={floating ? undefined : sheetContainer} data-testid="note-sheet">
        <SheetHeader onOpenAsPage={query.data ? () => openEntity({ id: noteId }) : undefined}>
          Note
        </SheetHeader>
        <SheetBody>
          {query.data && query.data.archivedAt === null ? (
            <NoteSheetBody key={query.data.id} note={query.data} />
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
      </SheetContent>
    </Sheet>
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
function NoteSheetBody({ note }: { note: Note }) {
  const actions = useNoteActions();
  const { formatRelative } = useFormat('minute');
  return (
    <>
      <Stack gap="1">
        <SheetTitle key={note.title} note={note} />
        <Text size="xs" tone="subtle">
          Edited {lowerFirst(formatRelative(note.updatedAt))}
        </Text>
      </Stack>
      <div className={styles.pills}>
        <ProjectPill
          value={note.projectId}
          placeholder="Add to project"
          onChange={(projectId) => actions.setProject([note], projectId)}
        />
      </div>
      <SheetDivider />
      <div className={styles.body}>
        <NoteEditor noteId={note.id} />
      </div>
    </>
  );
}
