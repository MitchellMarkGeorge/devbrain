import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CircleSlash, FileText } from 'lucide-react';
import type { EventId, NoteId, TaskId } from '@common/ids';
import type { Task } from '@common/types';
import {
  ColourBar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuList,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  resolveColor,
  StatusIcon,
  useFormat,
} from '../../components';
import { trpc } from '../../ipc';

// The pickers a task page opens from its properties and its "…" menu (Figma `7424:38759`,
// `7424:39461`): a searchable menu of notes and events to link the task to, and of tasks to make
// it a subtask of.

/** What the task links to: an event or a note, never both. */
export type TaskLink = { linkedEventId: EventId } | { linkedNoteId: NoteId } | null;

interface PickerShellProps {
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Link to › an event (the last week and the next four) or a note (the 50 edited last), searched
 * by title; "Remove link" when the task has one.
 */
export function TaskLinkPicker({
  task,
  kinds = ['event', 'note'],
  onPick,
  trigger,
  open,
  onOpenChange,
}: PickerShellProps & {
  task: Pick<Task, 'linkedEventId' | 'linkedNoteId'>;
  /** which kinds to offer; both by default */
  kinds?: readonly ('event' | 'note')[];
  onPick: (link: TaskLink) => void;
}) {
  const { now, formatDate } = useFormat();
  const range = useMemo(() => {
    const day = DateTime.fromJSDate(now).startOf('day');
    return { start: day.minus({ days: 7 }).toJSDate(), end: day.plus({ weeks: 4 }).toJSDate() };
  }, [now]);
  const events = useQuery({
    ...trpc.events.listForCalendar.queryOptions(range),
    enabled: open !== false && kinds.includes('event'),
  });
  const notes = useQuery({
    ...trpc.notes.list.queryOptions({
      sort: { sortBy: 'updatedAt', direction: 'desc' },
      limit: 50,
    }),
    enabled: open !== false && kinds.includes('note'),
  });
  // a series is one row, however often it repeats
  const eventRows = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? []).filter((event) => !seen.has(event.id) && seen.add(event.id));
  }, [events.data]);
  const linked = task.linkedEventId !== null || task.linkedNoteId !== null;

  return (
    <DropdownMenuFilter>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="start">
          <DropdownMenuSearch aria-label="Search events and notes" placeholder="Link to…" />
          <DropdownMenuList>
            {kinds.includes('event') && eventRows.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Events</DropdownMenuLabel>
                {eventRows.map((event) => (
                  <DropdownMenuItem
                    key={event.id}
                    icon={
                      <ColourBar
                        color={resolveColor(event.color, 'green') ?? 'green'}
                        height={14}
                      />
                    }
                    shortcut={formatDate(event.startAt)}
                    onClick={() => onPick({ linkedEventId: event.id })}
                  >
                    {event.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
            {kinds.includes('note') && (notes.data?.items.length ?? 0) > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Notes</DropdownMenuLabel>
                {notes.data?.items.map((note) => (
                  <DropdownMenuItem
                    key={note.id}
                    icon={FileText}
                    onClick={() => onPick({ linkedNoteId: note.id })}
                  >
                    {note.title || 'Untitled'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuList>
          <DropdownMenuEmpty>Nothing matches</DropdownMenuEmpty>
          {linked && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={CircleSlash} onClick={() => onPick(null)}>
                Remove link
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
  );
}

/** Make subtask of › an open top-level task other than this one, searched by title. */
export function TaskParentPicker({
  taskId,
  onPick,
  trigger,
  open,
  onOpenChange,
}: PickerShellProps & { taskId: TaskId; onPick: (parentId: TaskId) => void }) {
  const tasks = useQuery({
    ...trpc.tasks.list.queryOptions({
      filter: { excludeSubtasks: true, excludeClosed: true },
      sort: { sortBy: 'updatedAt', direction: 'desc' },
      limit: 100,
    }),
    enabled: open !== false,
  });
  const candidates = (tasks.data?.items ?? []).filter((task) => task.id !== taskId);
  return (
    <DropdownMenuFilter>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="start">
          <DropdownMenuSearch aria-label="Search tasks" placeholder="Make subtask of…" />
          <DropdownMenuList>
            {candidates.map((task) => (
              <DropdownMenuItem
                key={task.id}
                icon={<StatusIcon status={task.status} />}
                onClick={() => onPick(task.id)}
              >
                {task.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuList>
          <DropdownMenuEmpty>No tasks match</DropdownMenuEmpty>
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
  );
}
