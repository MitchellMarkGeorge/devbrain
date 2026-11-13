import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CircleSlash, FileText } from 'lucide-react';
import type { EventId, NoteId, TaskId } from '@common/ids';
import type { Task } from '@common/types';
import { isSynced } from '../queries';
import {
  ColourBar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
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
} from '../../../components';
import { trpc } from '../../../ipc';
import { PickerSearchFilter, ResultItem, usePickerSearch } from '../../search/picker-search';

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
/** The tasks Make subtask of › offers: open top-level tasks, the 100 changed last. */
const parentTasksQuery = () =>
  trpc.tasks.list.queryOptions({
    filter: { excludeSubtasks: true, excludeClosed: true },
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
 * Link to › an event (the last week and the next four) or a note (the 50 edited last); typing
 * searches every event and note. "Remove link" when the task has one.
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
          <DropdownMenuEmpty>Nothing matches</DropdownMenuEmpty>
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
  const search = usePickerSearch(kinds);
  const events = useQuery({
    ...linkEventsQuery(now),
    enabled: enabled && kinds.includes('event'),
  });
  const notes = useQuery({
    ...linkNotesQuery(),
    enabled: enabled && kinds.includes('note'),
  });
  // a series is one row, however often it repeats
  const eventRows = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? []).filter((event) => !seen.has(event.id) && seen.add(event.id));
  }, [events.data]);
  const pick = (type: 'event' | 'note', id: string) =>
    onPick(type === 'event' ? { linkedEventId: id as EventId } : { linkedNoteId: id as NoteId });

  if (search.results) {
    return (
      <DropdownMenuList>
        {kinds.map((kind) => {
          const rows = search.results?.filter((row) => row.type === kind) ?? [];
          if (rows.length === 0) return null;
          return (
            <DropdownMenuGroup key={kind}>
              <DropdownMenuLabel>{kind === 'event' ? 'Events' : 'Notes'}</DropdownMenuLabel>
              {rows.map((row) => (
                <ResultItem key={row.id} row={row} onClick={() => pick(kind, row.id)} />
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuList>
    );
  }
  const shownEvents = kinds.includes('event')
    ? eventRows.filter((event) => search.matches(event.title))
    : [];
  const shownNotes = kinds.includes('note')
    ? (notes.data?.items ?? []).filter((note) => search.matches(note.title || 'Untitled'))
    : [];
  return (
    <DropdownMenuList>
      {shownEvents.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel>Events</DropdownMenuLabel>
          {shownEvents.map((event) => (
            <DropdownMenuItem
              key={event.id}
              icon={<ColourBar color={resolveColor(event.color, 'green') ?? 'green'} height={14} />}
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
  );
}

/**
 * Make subtask of › an open top-level task other than this one: the 100 changed last, or what
 * search finds once something is typed. A synced task takes no subtasks, so it isn't offered.
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
          <DropdownMenuEmpty>No tasks match</DropdownMenuEmpty>
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

const TASK_TYPES = ['task'] as const;

// Make subtask of›'s rows. Only a top-level task is offered, so the task's own subtasks never are.
function ParentItems({
  taskId,
  enabled,
  onPick,
}: {
  taskId: TaskId;
  enabled: boolean;
  onPick: (parentId: TaskId) => void;
}) {
  const search = usePickerSearch(TASK_TYPES);
  const tasks = useQuery({ ...parentTasksQuery(), enabled });
  if (search.results) {
    const rows = search.results.filter(
      (row) => row.id !== taskId && row.parentTaskId === null && !row.closed && !row.synced,
    );
    return (
      <DropdownMenuList>
        {rows.map((row) => (
          <ResultItem key={row.id} row={row} onClick={() => onPick(row.id as TaskId)} />
        ))}
      </DropdownMenuList>
    );
  }
  const candidates = (tasks.data?.items ?? []).filter(
    (task) => task.id !== taskId && !isSynced(task) && search.matches(task.title),
  );
  return (
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
  );
}
