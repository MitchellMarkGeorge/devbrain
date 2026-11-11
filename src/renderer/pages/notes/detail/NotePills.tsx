import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CircleCheck, Plus } from 'lucide-react';
import type { TaskId } from '@common/ids';
import type { Note } from '@common/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EntityPill,
} from '../../../components';
import { trpc } from '../../../ipc';
import { useOpenEntity } from '../../app/use-open-entity';
import { ProjectPill } from '../../tasks/menus/pickers';
import { TaskPickerSubmenu } from '../menus/NoteMenus';
import { noteTasksQuery, tasksSummary } from '../queries';
import type { NoteActions } from '../use-note-actions';

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
 * "+ Add to project"; the task or event it links to; and the tasks made from it ("3 tasks · 2 in
 * progress"), or "+ Add task", which creates one linked to the note or links one that exists.
 */
export function NotePills({
  note,
  actions,
  onNewTask,
  onLinkTask,
}: {
  note: Note;
  actions: NoteActions;
  onNewTask: () => void;
  onLinkTask: (id: TaskId) => void;
}) {
  const tasks = useInfiniteQuery(noteTasksQuery(note.id));
  const statuses = useMemo(
    () => tasks.data?.pages.flatMap((page) => page.items.map((task) => task.status)) ?? [],
    [tasks.data],
  );
  const summary = tasksSummary(statuses);
  return (
    <>
      <ProjectPill
        value={note.projectId}
        placeholder="Add to project"
        onChange={(projectId) => actions.setProject([note], projectId)}
      />
      <LinkPill note={note} />
      {summary ? (
        <EntityPill glyph={CircleCheck}>{summary}</EntityPill>
      ) : (
        tasks.isSuccess && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <EntityPill interactive glyph={Plus}>
                  Add task
                </EntityPill>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem icon={Plus} onClick={onNewTask}>
                New task linked to this note
              </DropdownMenuItem>
              <TaskPickerSubmenu exclude={new Set()} onPick={onLinkTask} />
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
    </>
  );
}
