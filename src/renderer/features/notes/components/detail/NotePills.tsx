import { useQuery } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import type { Note, NoteListItem } from '@common/types';
import { EntityPill } from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ItemMentionsPill } from '@renderer/shared/components/ItemMentions';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { ProjectPill } from '@renderer/features/tasks/components/menus/pickers';
import { NoteTasksPill } from './NoteTasksPill';
import type { NoteActions } from '../../hooks/use-note-actions';

/** The task or event the note links to, as a pill opening it; nothing while it loads. */
function LinkPill({ note }: { note: Note }) {
  const openEntity = useOpenEntity();
  const task = useQuery({
    ...trpc.tasks.get.queryOptions({ id: note.linkedTaskId! }),
    enabled: note.linkedTaskId !== null,
  });
  const event = useQuery({
    ...trpc.events.get.queryOptions({ id: note.linkedEventId! }),
    enabled: note.linkedEventId !== null,
  });
  if (note.linkedTaskId && task.data) {
    return (
      <EntityPill
        interactive
        entity={{ type: 'task', title: task.data.title, status: task.data.status }}
        onClick={() => openEntity({ id: task.data.id })}
      />
    );
  }
  if (note.linkedEventId && event.data) {
    return (
      <EntityPill
        interactive
        entity={{ type: 'event', title: event.data.title, color: event.data.color }}
        onClick={() => openEntity({ id: event.data.id, startAt: event.data.startAt })}
      />
    );
  }
  return null;
}

/**
 * The pills under a note's title (Figma `7158:16387`, `7158:16863`, `7421:36683`): its project, or
 * "+ Add to project"; the task or event it links to; its tasks ("3 tasks · 2 in progress",
 * opening them in a popover), or "+ Add task"; and what mentions it ("4 mentions").
 */
export function NotePills({
  note,
  actions,
  onNewTask,
  onLinkTask,
  onOpenTask,
}: {
  /** as `notes.get` reads it: with its project, which its pill draws */
  note: NoteListItem;
  actions: NoteActions;
  onNewTask: () => void;
  onLinkTask: (id: TaskId) => void;
  onOpenTask: (id: TaskId) => void;
}) {
  return (
    <>
      <ProjectPill
        value={note.project}
        placeholder="Add to project"
        onChange={(project) => actions.setProject([note], project?.id ?? null)}
      />
      <LinkPill note={note} />
      <NoteTasksPill
        noteId={note.id}
        onNewTask={onNewTask}
        onLinkTask={onLinkTask}
        onOpenTask={onOpenTask}
      />
      <ItemMentionsPill targetId={note.id} />
    </>
  );
}
