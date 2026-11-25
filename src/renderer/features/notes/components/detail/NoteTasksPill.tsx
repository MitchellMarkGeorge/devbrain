import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleCheck, Link, Plus } from 'lucide-react';
import type { NoteId, TaskId } from '@common/ids';
import type { TaskListItem } from '@common/types';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EntityPill,
  LinkedTaskRow,
  PillPopover,
} from '@renderer/components';
import { TaskMenuItems } from '@renderer/features/tasks/components/menus/TaskMenus';
import { useTaskActions } from '@renderer/features/tasks/hooks/use-task-actions';
import { TaskPicker, TaskPickerSubmenu } from '../menus/NoteMenus';
import { noteTasksQuery, tasksSummary } from '../../api/queries';
import styles from './NotePage.module.css';

export interface NoteTasksPillProps {
  noteId: NoteId;
  /** "New": Create task, linked to the note */
  onNewTask: () => void;
  /** "Link": links an existing task to the note */
  onLinkTask: (id: TaskId) => void;
  /** opens a task (a click on its row, ↵, the menu's Open task): the page's task sheet */
  onOpenTask: (id: TaskId) => void;
}

/**
 * A note's Tasks, as a pill under its title (`PillPopover`): "2 tasks · 1 in progress", opening
 * the tasks made from it (`linkedNoteId`) under "Tasks", with Link and New. Each row changes
 * status at once and opens in the page's task sheet on click or ↵, with the row menu on
 * right-click. With no tasks, "+ Add task" offers both instead.
 */
export function NoteTasksPill({ noteId, onNewTask, onLinkTask, onOpenTask }: NoteTasksPillProps) {
  const query = useInfiniteQuery(noteTasksQuery(noteId));
  const tasks = useMemo<TaskListItem[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id as string, t])), [tasks]);
  const actions = useTaskActions();
  const [open, setOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const summary = tasksSummary(tasks.map((task) => task.status));

  // the sheet or the create dialog takes over from the popover
  const openTask = (id: TaskId) => {
    setOpen(false);
    onOpenTask(id);
  };

  if (!summary) {
    if (!query.isSuccess) return null;
    return (
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
    );
  }
  return (
    <PillPopover
      glyph={CircleCheck}
      label={summary}
      heading="Tasks"
      open={open}
      onOpenChange={setOpen}
      data-testid="note-tasks-pill"
      action={
        <>
          <TaskPicker
            exclude={new Set(byId.keys())}
            onPick={onLinkTask}
            trigger={
              <Button size="xs" variant="ghost" icon={Link}>
                Link
              </Button>
            }
          />
          <Button
            size="xs"
            variant="ghost"
            icon={Plus}
            onClick={() => {
              setOpen(false);
              onNewTask();
            }}
          >
            New
          </Button>
        </>
      }
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={<div data-testid="note-tasks" />}
          onContextMenu={(event) => {
            const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
            const found = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
            setMenuTask(found);
            if (!found) event.preventDefault();
          }}
        >
          {tasks.map((task) => (
            <LinkedTaskRow
              key={task.id}
              data-task-id={task.id}
              task={task}
              onStatusChange={(status) => actions.setStatus([task], status)}
              onOpen={() => openTask(task.id)}
            />
          ))}
          {query.hasNextPage && (
            <button
              type="button"
              className={styles.more}
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              Show more
            </button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {menuTask && (
            <TaskMenuItems
              task={byId.get(menuTask.id) ?? menuTask}
              actions={actions}
              onOpen={() => openTask(menuTask.id)}
            />
          )}
        </ContextMenuContent>
      </ContextMenu>
    </PillPopover>
  );
}
