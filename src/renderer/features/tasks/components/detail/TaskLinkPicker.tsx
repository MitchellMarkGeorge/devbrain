import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CircleSlash, FileText } from 'lucide-react';
import type { EventId, NoteId, TaskId } from '@common/ids';
import type { Event, NoteListItem, Task } from '@common/types';
import {
  ColourBar,
  DropdownMenu,
  DropdownMenuContent,
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
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import {
  PICKER_SEARCH_LIMIT,
  PickerEmpty,
  PickerSearchFilter,
  usePickerSearch,
} from '@renderer/features/search/components/picker-search';

// The pickers a task page opens from its properties and its "…" menu (Figma `7424:38759`,
// `7424:39461`): a searchable menu of notes and events to link the task to, and of tasks to make
// it a subtask of.

/** What the task links to: an event or a note, never both. */
export type TaskLink = { linkedEventId: EventId } | { linkedNoteId: NoteId } | null;

/** The events Link to › offers: the last week and the next four. */
function linkEventsQuery(now: Date) {
  const day = DateTime.fromJSDate(now).startOf('day');
  return trpc.events.listForCalendar.queryOptions({
    start: day.minus({ days: 7 }).toJSDate(),
    end: day.plus({ weeks: 4 }).toJSDate(),
  });
}
/** The notes Link to › offers: the 50 edited last. */
const linkNotesQuery = () =>
  trpc.notes.list.queryOptions({ sort: { sortBy: 'updatedAt', direction: 'desc' }, limit: 50 });
/**
 * The tasks Make subtask of › offers, loaded or searched: open local top-level tasks. A synced task
 * takes no subtasks of the user's, and only a top-level task is offered, so the task's own
 * subtasks never are.
 */
const PARENT_FILTER = { excludeSubtasks: true, excludeClosed: true, origin: 'local' } as const;
/** The 100 of them changed last, listed while nothing is typed. */
const parentTasksQuery = () =>
  trpc.tasks.list.queryOptions({
    filter: PARENT_FILTER,
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: 100,
  });

/**
 * Loads what the task pickers list while the task is shown, so a picker opens with its rows
 * rather than empty and then growing as they arrive. Call it where the pickers can open.
 */
export function usePickerCandidates(enabled: boolean) {
  const { now } = useFormat();
  useQuery({ ...linkEventsQuery(now), enabled });
  useQuery({ ...linkNotesQuery(), enabled });
  useQuery({ ...parentTasksQuery(), enabled });
}

interface PickerShellProps {
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Link to › an event (the last week and the next four) or a note (the 50 edited last), or any
 * event or note matching what is typed; "Remove link" when the task has one.
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
  return (
    <PickerSearchFilter>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="start">
          <DropdownMenuSearch aria-label="Search events and notes" placeholder="Link to…" />
          <LinkItems kinds={kinds} enabled={open !== false} onPick={onPick} />
          {(task.linkedEventId !== null || task.linkedNoteId !== null) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={CircleSlash} onClick={() => onPick(null)}>
                Remove link
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

// Link to›'s rows: the loaded events and notes while nothing is typed, else what search finds
function LinkItems({
  kinds,
  enabled,
  onPick,
}: {
  kinds: readonly ('event' | 'note')[];
  enabled: boolean;
  onPick: (link: TaskLink) => void;
}) {
  const { now, formatDate } = useFormat();
  const offersEvents = kinds.includes('event');
  const offersNotes = kinds.includes('note');
  const events = useQuery({ ...linkEventsQuery(now), enabled: enabled && offersEvents });
  const notes = useQuery({ ...linkNotesQuery(), enabled: enabled && offersNotes });
  const eventSearch = usePickerSearch(
    (query) => trpc.events.search.queryOptions({ query, limit: PICKER_SEARCH_LIMIT }),
    offersEvents,
  );
  const noteSearch = usePickerSearch(
    (query) => trpc.notes.search.queryOptions({ query, limit: PICKER_SEARCH_LIMIT }),
    offersNotes,
  );
  // a series is one row, however often it repeats
  const eventRows = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? []).filter((event) => !seen.has(event.id) && seen.add(event.id));
  }, [events.data]);
  const shownEvents: Event[] = offersEvents ? (eventSearch.results ?? eventRows) : [];
  const shownNotes: NoteListItem[] = offersNotes
    ? (noteSearch.results ?? notes.data?.items ?? [])
    : [];

  return (
    <>
      <DropdownMenuList>
        {shownEvents.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Events</DropdownMenuLabel>
            {shownEvents.map((event) => (
              <DropdownMenuItem
                key={event.id}
                icon={
                  <ColourBar color={resolveColor(event.color, 'green') ?? 'green'} height={14} />
                }
                shortcut={formatDate(event.startAt)}
                onClick={() => onPick({ linkedEventId: event.id })}
              >
                {event.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {shownNotes.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Notes</DropdownMenuLabel>
            {shownNotes.map((note) => (
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
      <PickerEmpty searching={eventSearch.searching || noteSearch.searching}>
        Nothing matches
      </PickerEmpty>
    </>
  );
}

/**
 * Make subtask of › an open, local, top-level task other than this one: the 100 changed last, or
 * every such task matching what is typed.
 */
export function TaskParentPicker({
  taskId,
  onPick,
  trigger,
  open,
  onOpenChange,
}: PickerShellProps & { taskId: TaskId; onPick: (parentId: TaskId) => void }) {
  return (
    <PickerSearchFilter>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="start">
          <DropdownMenuSearch aria-label="Search tasks" placeholder="Make subtask of…" />
          <ParentItems taskId={taskId} enabled={open !== false} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

// Make subtask of›'s rows: the loaded tasks while nothing is typed, else what search finds
function ParentItems({
  taskId,
  enabled,
  onPick,
}: {
  taskId: TaskId;
  enabled: boolean;
  onPick: (parentId: TaskId) => void;
}) {
  const tasks = useQuery({ ...parentTasksQuery(), enabled });
  const search = usePickerSearch((query) =>
    trpc.tasks.search.queryOptions({ query, filter: PARENT_FILTER, limit: PICKER_SEARCH_LIMIT }),
  );
  const candidates = (search.results ?? tasks.data?.items ?? []).filter(
    (task) => task.id !== taskId,
  );
  return (
    <>
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
      <PickerEmpty searching={search.searching}>No tasks match</PickerEmpty>
    </>
  );
}
