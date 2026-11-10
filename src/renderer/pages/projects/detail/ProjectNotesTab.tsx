import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleX, FileText, Plus } from 'lucide-react';
import type { Project } from '@common/types';
import {
  Button,
  EmptyState,
  NoteCard,
  NoteCardSkeleton,
  PageContent,
  PageToolbar,
  Stack,
  VirtualCardGrid,
} from '../../../components';
import { ipc } from '../../../ipc';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { useOpenEntity } from '../../app/use-open-entity';
import { projectNotesQuery } from '../queries';

// a row of note cards: 156px with a pill, and the 16px gap
const NOTE_ROW_HEIGHT = 172;

/**
 * The Notes tab (Figma `7159:13886`): the project's notes as cards, the most recently edited first,
 * each opening its note page, and New Note, which creates one in the project and opens it.
 */
export function ProjectNotesTab({ project }: { project: Project }) {
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const query = useInfiniteQuery(projectNotesQuery(project.id));
  const notes = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const newNote = () =>
    ipc.notes.create
      .mutate({ projectId: project.id })
      .then((note) => openEntity({ id: note.id }))
      .catch((error: unknown) => showError(error, 'Couldn’t create the note'));

  let content;
  if (query.isPending) {
    content = (
      <Stack gap="4" aria-busy>
        <NoteCardSkeleton />
      </Stack>
    );
  } else if (query.isError) {
    content = (
      <EmptyState
        icon={CircleX}
        title="Notes couldn’t be loaded"
        description="Something went wrong reading this project’s notes."
        action={
          <Button size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  } else if (notes.length === 0) {
    content = (
      <EmptyState
        icon={FileText}
        title="No notes in this project yet"
        description="Notes you file in this project show up here."
        action={
          <Button size="sm" icon={Plus} onClick={() => void newNote()}>
            New Note
          </Button>
        }
      />
    );
  } else {
    content = (
      <VirtualCardGrid
        gap="md"
        items={notes}
        getKey={(note) => note.id}
        estimateRowHeight={NOTE_ROW_HEIGHT}
        aria-label="Notes"
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        renderItem={(note) => (
          <NoteCard
            note={note}
            role="link"
            aria-label={note.title || 'Untitled'}
            onClick={() => openEntity({ id: note.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openEntity({ id: note.id });
            }}
          />
        )}
      />
    );
  }

  return (
    <>
      <PageToolbar
        end={
          <Button icon={Plus} onClick={() => void newNote()}>
            New Note
          </Button>
        }
      />
      <PageContent layout="grid" data-testid="project-notes">
        {content}
      </PageContent>
    </>
  );
}
