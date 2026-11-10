import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NoteListItem } from '@common/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  NoteCard,
  NoteList,
  VirtualCardGrid,
  type NoteListHandle,
} from '../../../components';
import { KeyScope, useListCommands } from '../../../keyboard';
import { useOpenEntity } from '../../app/use-open-entity';
import { NoteMenuItems } from '../menus/NoteMenus';
import { noteListQuery } from '../queries';
import { hasFilters, noteListInput, type NotesSearch, type ResolvedNotesSearch } from '../search';
import { useNoteActions } from '../use-note-actions';
import { NotesEmptyState, NotesErrorState, NotesLoading } from './NotesStates';
import styles from './NotesView.module.css';

export interface NotesViewProps {
  resolved: ResolvedNotesSearch;
  search: NotesSearch;
  onClearFilters: () => void;
  onNewNote: () => void;
}

/**
 * The notes, as a list (Figma `7158:11693`) or cards (`7158:12276`), over `notes.list`'s pages,
 * loading the next as the end comes near. A row or card opens its note; right-click shows its menu
 * (`7175:29569`); in the list, the list keys move, open (↵), favorite (F) and trash (⌘⌫).
 */
export function NotesView({ resolved, search, onClearFilters, onNewNote }: NotesViewProps) {
  const query = useInfiniteQuery(noteListQuery(noteListInput(resolved)));
  const notes = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const byId = useMemo(() => new Map(notes.map((note) => [note.id as string, note])), [notes]);
  const actions = useNoteActions();
  const openEntity = useOpenEntity();
  const list = useRef<NoteListHandle<NoteListItem>>(null);
  // the note whose row or card was right-clicked: the menu is drawn for it
  const [menuNote, setMenuNote] = useState<NoteListItem | null>(null);
  const open = (note: { id: string }) => openEntity({ id: note.id });
  const more = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };

  useListCommands(list, {
    open,
    toggleFavorite: (rows) => rows.forEach((note) => actions.toggleFavorite(note)),
    trash: (rows) => {
      if (rows[0]) void actions.trash(rows[0]);
    },
  });

  if (query.isPending) return <NotesLoading view={resolved.view} />;
  if (query.isError) return <NotesErrorState onRetry={() => void query.refetch()} />;
  if (notes.length === 0)
    return (
      <NotesEmptyState
        filtered={hasFilters(search)}
        onClearFilters={onClearFilters}
        onNewNote={onNewNote}
      />
    );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        style={{ display: 'contents' }}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-note-id]');
          const note = row ? (byId.get(row.dataset.noteId ?? '') ?? null) : null;
          setMenuNote(note);
          if (!note) event.preventDefault();
        }}
      >
        {resolved.view === 'card' ? (
          <VirtualCardGrid
            items={notes}
            getKey={(note) => note.id}
            gap="md"
            estimateRowHeight={156 + 16}
            aria-label="Notes"
            onEndReached={more}
            renderItem={(note) => (
              <NoteCard
                note={note}
                data-note-id={note.id}
                role="link"
                aria-label={note.title || 'Untitled'}
                onClick={() => open(note)}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === 'Enter') open(note);
                }}
              />
            )}
          />
        ) : (
          <KeyScope name="list" render={<div className={styles.region} />}>
            <NoteList
              ref={list}
              notes={notes}
              aria-label="Notes"
              onOpen={open}
              onEndReached={more}
            />
          </KeyScope>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuNote && (
          <NoteMenuItems
            note={byId.get(menuNote.id) ?? menuNote}
            actions={actions}
            onOpen={() => open(menuNote)}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
