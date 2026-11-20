import { useCallback, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Copy, SquareArrowOutUpRight, Video } from 'lucide-react';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import type { ExternalRef } from '@common/types';
import {
  Button,
  EntityHoverCardContent,
  EntityHoverCardPlaceholder,
  PillHoverCardsProvider,
  PROVIDER_LABELS,
  providerOf,
  toast,
  type PillTarget,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';

// The hover cards of the pills in rows and cards (TaskRow, NoteRow, BoardCard, NoteCard): each
// loads its item through the route that reads one (`projects.get` and `projects.stats`,
// `tasks.get`, `notes.get`, `events.get`; a subtask count `tasks.get` and `tasks.subtasks`) once a pill is pointed at, so a card opened 400ms later
// is drawn. The query invalidator refetches them when core reports a change.

// not again while what was loaded is a few seconds old: a change to it refetches it anyway
const PREFETCH_STALE_MS = 10_000;

// a failed read is the card's to show (its own query reads again), not the prefetch's
const ignore = () => {};

/** Starts the reads a pill's card makes, as the pill is pointed at; the card is drawn from them. */
function prefetch(queryClient: QueryClient, target: PillTarget) {
  const staleTime = PREFETCH_STALE_MS;
  switch (target.type) {
    case 'project':
      queryClient
        .query({ ...trpc.projects.get.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      queryClient
        .query({ ...trpc.projects.stats.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      return;
    case 'task':
      queryClient
        .query({ ...trpc.tasks.get.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      return;
    // the task's count, from tasks.get, over its subtasks
    case 'subtasks':
      queryClient
        .query({ ...trpc.tasks.get.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      queryClient.query({ ...subtasksCardQuery(target.id), staleTime }).catch(ignore);
      return;
    case 'note':
      queryClient
        .query({ ...trpc.notes.get.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      return;
    case 'event':
      queryClient
        .query({ ...trpc.events.get.queryOptions({ id: target.id }), staleTime })
        .catch(ignore);
      return;
    case 'source':
      return;
  }
}

// a subtask card's subtasks: one page of `tasks.subtasks`, as many as a task usually has
function subtasksCardQuery(id: TaskId) {
  return trpc.tasks.subtasks.queryOptions({ id, limit: 100 });
}

// a card whose item could not be read (deleted since the list loaded): its name and why
const GONE = 'No longer available';

function ProjectCard({ id, title }: { id: ProjectId; title: string }) {
  const project = useQuery(trpc.projects.get.queryOptions({ id }));
  const stats = useQuery(trpc.projects.stats.queryOptions({ id }));
  if (project.isError) return <EntityHoverCardPlaceholder title={title} message={GONE} />;
  if (!project.data || stats.isPending) return <EntityHoverCardPlaceholder title={title} />;
  return (
    <EntityHoverCardContent entity={{ type: 'project', ...project.data, stats: stats.data }} />
  );
}

function TaskCard({ id, title }: { id: TaskId; title: string }) {
  const task = useQuery(trpc.tasks.get.queryOptions({ id }));
  if (task.isError) return <EntityHoverCardPlaceholder title={title} message={GONE} />;
  if (!task.data) return <EntityHoverCardPlaceholder title={title} />;
  return <EntityHoverCardContent entity={{ type: 'task', ...task.data }} />;
}

function NoteCard({ id, title }: { id: NoteId; title: string }) {
  const note = useQuery(trpc.notes.get.queryOptions({ id }));
  if (note.isError) return <EntityHoverCardPlaceholder title={title} message={GONE} />;
  if (!note.data) return <EntityHoverCardPlaceholder title={title} />;
  return (
    <EntityHoverCardContent
      entity={{ type: 'note', ...note.data, title: note.data.title || 'Untitled' }}
    />
  );
}

function EventCard({ id, title }: { id: EventId; title: string }) {
  const event = useQuery(trpc.events.get.queryOptions({ id }));
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  if (event.isError) return <EntityHoverCardPlaceholder title={title} message={GONE} />;
  if (!event.data) return <EntityHoverCardPlaceholder title={title} />;
  const { meetingUrl } = event.data;
  return (
    <EntityHoverCardContent
      entity={{ type: 'event', ...event.data }}
      actions={
        meetingUrl && (
          <Button size="xs" icon={Video} onClick={() => openUrl({ url: meetingUrl })}>
            Join
          </Button>
        )
      }
    />
  );
}

function SourceCard({ title, external }: { title: string; external: ExternalRef }) {
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  const provider = providerOf(external);
  const name = provider ? PROVIDER_LABELS[provider] : 'the provider';
  return (
    <EntityHoverCardContent
      entity={{ type: 'source', title, external }}
      actions={
        <>
          <Button
            size="xs"
            icon={SquareArrowOutUpRight}
            onClick={() => openUrl({ url: external.url })}
          >
            Open in {name}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            icon={Copy}
            onClick={() =>
              navigator.clipboard
                .writeText(external.url)
                .then(() => toast({ tone: 'success', title: 'URL copied' }))
            }
          >
            Copy URL
          </Button>
        </>
      }
    />
  );
}

function SubtasksCard({ id, title }: { id: TaskId; title: string }) {
  const task = useQuery(trpc.tasks.get.queryOptions({ id }));
  const subtasks = useQuery(subtasksCardQuery(id));
  if (task.isError || subtasks.isError) {
    return <EntityHoverCardPlaceholder title={title} message={GONE} />;
  }
  const progress = task.data?.subtaskProgress;
  if (!progress || !subtasks.data) return <EntityHoverCardPlaceholder title={title} />;
  return (
    <EntityHoverCardContent
      entity={{ type: 'subtasks', subtaskProgress: progress, subtasks: subtasks.data.items }}
    />
  );
}

function PillCard({ target }: { target: PillTarget }) {
  switch (target.type) {
    case 'project':
      return <ProjectCard id={target.id} title={target.title} />;
    case 'task':
      return <TaskCard id={target.id} title={target.title} />;
    case 'note':
      return <NoteCard id={target.id} title={target.title || 'Untitled'} />;
    case 'event':
      return <EventCard id={target.id} title={target.title} />;
    case 'subtasks':
      return <SubtasksCard id={target.id} title={target.title} />;
    case 'source':
      return <SourceCard title={target.title} external={target.external} />;
  }
}

const renderCard = (target: PillTarget) => <PillCard target={target} />;

/**
 * Gives the pills of every row and card inside it their hover cards, loading each item as its pill
 * is pointed at. The workspace layout puts it around the pages.
 */
export function PillCardsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const onPrepare = useCallback(
    (target: PillTarget) => prefetch(queryClient, target),
    [queryClient],
  );
  return (
    <PillHoverCardsProvider renderCard={renderCard} onPrepare={onPrepare}>
      {children}
    </PillHoverCardsProvider>
  );
}
