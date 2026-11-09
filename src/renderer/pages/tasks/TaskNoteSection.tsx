import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NoteId } from '@common/ids';
import { TaskStatus, type Task } from '@common/types';
import { AddSlot, DetailSection, resolveColor, TaskNoteCard, useFormat } from '../../components';
import { ipc, trpc } from '../../ipc';
import { useModals } from '../../modals';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';
import { TaskNoteDialog } from './TaskNoteDialog';

export interface TaskNoteSectionProps {
  /** the task, as `tasks.get` returns it */
  task: Pick<Task, 'id' | 'title'>;
  /** the board's task sheet: the card's pills under its title, and the sheet's spacing */
  compact?: boolean;
}

// "2 tasks · 1 in progress": the tasks made from the note
function tasksSummary(statuses: readonly TaskStatus[]): string | undefined {
  if (statuses.length === 0) return undefined;
  const started = statuses.filter((status) => status === TaskStatus.IN_PROGRESS).length;
  const count = `${statuses.length} ${statuses.length === 1 ? 'task' : 'tasks'}`;
  return started > 0 ? `${count} · ${started} in progress` : count;
}

/**
 * The task note (the note whose `linkedTaskId` is the task): its `TaskNoteCard`, opening the task
 * note dialog, or "+ Add a task note", which creates one named after the task and opens it.
 */
export function TaskNoteSection({ task, compact = false }: TaskNoteSectionProps) {
  const modals = useModals();
  const openEntity = useOpenEntity();
  const showError = useMutationErrorToast();
  const { formatRelative } = useFormat('minute');
  const [creating, setCreating] = useState(false);
  const notes = useQuery(
    trpc.notes.list.queryOptions({ filter: { linkedTaskId: task.id }, limit: 1 }),
  );
  const note = notes.data?.items[0];
  const linked = useQuery({
    ...trpc.tasks.list.queryOptions({ filter: { noteId: note?.id }, limit: 50 }),
    enabled: note !== undefined,
  });

  const open = (id: NoteId) =>
    modals.open((props) => (
      <TaskNoteDialog {...props} noteId={id} onOpenFullView={() => openEntity({ id })} />
    ));

  async function create() {
    setCreating(true);
    try {
      const created = await ipc.notes.create.mutate({ title: task.title, linkedTaskId: task.id });
      open(created.id);
    } catch (error) {
      showError(error, 'Couldn’t add a task note');
    } finally {
      setCreating(false);
    }
  }

  return (
    <DetailSection spacing={compact ? 'sheet' : 'page'} title="Task note">
      {note ? (
        <TaskNoteCard
          title={note.title || 'Untitled'}
          updated={formatRelative(note.updatedAt)}
          project={note.project?.title}
          projectColor={resolveColor(note.project?.color, 'blue')}
          tasksSummary={tasksSummary(linked.data?.items.map((t) => t.status) ?? [])}
          layout={compact ? 'stacked' : 'auto'}
          onOpen={() => open(note.id)}
        />
      ) : (
        notes.isSuccess && (
          <AddSlot
            size={compact ? 'default' : 'lg'}
            disabled={creating}
            onClick={() => void create()}
          >
            Add a task note
          </AddSlot>
        )
      )}
    </DetailSection>
  );
}
