import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { CircleSlash, Code, Link, SquareArrowOutUpRight, Star, Trash2 } from 'lucide-react';
import type { TaskId } from '@common/ids';
import type { Note } from '@common/types';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  isClosed,
  resolveColor,
  StatusIcon,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import {
  PickerEmpty,
  PickerSearchFilter,
  PickerTitle,
  pickerRows,
  usePickerSearch,
} from '@renderer/features/search/components/picker-search';
import { ProjectSubmenu } from '@renderer/features/tasks/components/menus/TaskMenus';
import { isSynced } from '@renderer/features/tasks/api/queries';
import type { NoteActions, NoteLink } from '../../hooks/use-note-actions';

// The notes pages' menus (Figma `7175:29569`, `7527:51820`, `7424:42259`), built from
// DropdownMenu parts, so they work in a DropdownMenu and a ContextMenu alike.

const TRASH = '⌘⌫';

/** The events Link to › offers: the last week and the next four. */
function linkEventsQuery(now: Date) {
  const day = DateTime.fromJSDate(now).startOf('day');
  return trpc.events.listForCalendar.queryOptions({
    start: day.minus({ days: 7 }).toJSDate(),
    end: day.plus({ weeks: 4 }).toJSDate(),
  });
}

/**
 * The tasks a note can link to, or be linked from, while nothing is typed: open tasks, the 100
 * changed last. A search's matches leave out closed tasks too.
 */
const linkTasksQuery = () =>
  trpc.tasks.list.queryOptions({
    filter: { excludeClosed: true },
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: 100,
  });

const EVENT_TYPES = ['event'] as const;
const TASK_TYPES = ['task'] as const;

/**
 * Link to › an event (the last week and the next four) or a task (open, the 100 changed last),
 * or any event or open task matching what is typed; "Remove link" when the note has one. Inside
 * a `PickerSearchFilter`.
 */
export function NoteLinkItems({
  note,
  onPick,
}: {
  note: Pick<Note, 'linkedEventId' | 'linkedTaskId'>;
  onPick: (link: NoteLink) => void;
}) {
  const { now, formatDate } = useFormat();
  const events = useQuery(linkEventsQuery(now));
  const tasks = useQuery(linkTasksQuery());
  const eventSearch = usePickerSearch(EVENT_TYPES);
  const taskSearch = usePickerSearch(TASK_TYPES);
  // a series is one row, however often it repeats
  const loadedEvents = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? []).filter((event) => !seen.has(event.id) && seen.add(event.id));
  }, [events.data]);
  const eventRows = pickerRows(eventSearch.results, loadedEvents);
  const taskRows = pickerRows(taskSearch.results, tasks.data?.items ?? []).filter(
    ({ entity }) => !isClosed(entity.status),
  );
  const linked = note.linkedEventId !== null || note.linkedTaskId !== null;
  return (
    <>
      <DropdownMenuSearch
        aria-label="Search events and tasks"
        placeholder="Link to an event or task…"
      />
      <DropdownMenuList>
        {eventRows.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Events</DropdownMenuLabel>
            {eventRows.map((row) => (
              <DropdownMenuItem
                key={row.entity.id}
                icon={
                  <ColourBar
                    color={resolveColor(row.entity.color, 'green') ?? 'green'}
                    height={14}
                  />
                }
                label={row.entity.title}
                shortcut={formatDate(row.entity.startAt)}
                onClick={() => onPick({ linkedEventId: row.entity.id })}
              >
                <PickerTitle row={row} title={row.entity.title} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {taskRows.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Tasks</DropdownMenuLabel>
            {taskRows.map((row) => (
              <DropdownMenuItem
                key={row.entity.id}
                icon={<StatusIcon status={row.entity.status} />}
                label={row.entity.title}
                shortcut={row.entity.dueDate ? formatDate(row.entity.dueDate) : undefined}
                onClick={() => onPick({ linkedTaskId: row.entity.id })}
              >
                <PickerTitle row={row} title={row.entity.title} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuList>
      <PickerEmpty searching={eventSearch.searching || taskSearch.searching}>
        Nothing matches
      </PickerEmpty>
      {linked && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={CircleSlash} onClick={() => onPick(null)}>
            Remove link
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

/** Link to › (the "…" menu) or Change link › (a row's menu) */
export function LinkSubmenu({
  note,
  label = 'Link to',
  onPick,
}: {
  note: Pick<Note, 'linkedEventId' | 'linkedTaskId'>;
  label?: ReactNode;
  onPick: (link: NoteLink) => void;
}) {
  return (
    <PickerSearchFilter>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Link}>{label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="lg">
          <NoteLinkItems note={note} onPick={onPick} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </PickerSearchFilter>
  );
}

/**
 * The open tasks a note can be linked from, loaded or matching what is typed, leaving out those
 * already linked and local subtasks (a subtask takes its links from its parent). Inside a
 * `PickerSearchFilter`.
 */
export function TaskPickerItems({
  exclude,
  onPick,
}: {
  /** the tasks already linked */
  exclude: ReadonlySet<string>;
  onPick: (id: TaskId) => void;
}) {
  const { formatDate } = useFormat();
  const tasks = useQuery(linkTasksQuery());
  const search = usePickerSearch(TASK_TYPES);
  const candidates = pickerRows(search.results, tasks.data?.items ?? []).filter(
    ({ entity }) =>
      !exclude.has(entity.id) &&
      !isClosed(entity.status) &&
      (entity.parentTaskId === null || isSynced(entity)),
  );
  return (
    <>
      <DropdownMenuSearch aria-label="Search tasks" placeholder="Link a task…" />
      <DropdownMenuList>
        {candidates.map((row) => (
          <DropdownMenuItem
            key={row.entity.id}
            icon={<StatusIcon status={row.entity.status} />}
            label={row.entity.title}
            shortcut={row.entity.dueDate ? formatDate(row.entity.dueDate) : undefined}
            onClick={() => onPick(row.entity.id)}
          >
            <PickerTitle row={row} title={row.entity.title} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <PickerEmpty searching={search.searching}>No tasks match</PickerEmpty>
    </>
  );
}

/** Link Task: the picker of open tasks, as a menu of its own on `trigger`. */
export function TaskPicker({
  exclude,
  onPick,
  trigger,
}: {
  exclude: ReadonlySet<string>;
  onPick: (id: TaskId) => void;
  trigger: ReactElement;
}) {
  return (
    <PickerSearchFilter>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="end">
          <TaskPickerItems exclude={exclude} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>
    </PickerSearchFilter>
  );
}

/** "Link existing task ›": the task picker as a submenu. */
export function TaskPickerSubmenu({
  exclude,
  onPick,
}: {
  exclude: ReadonlySet<string>;
  onPick: (id: TaskId) => void;
}) {
  return (
    <PickerSearchFilter>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Link}>Link existing task</DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="lg">
          <TaskPickerItems exclude={exclude} onPick={onPick} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </PickerSearchFilter>
  );
}

/** The note a menu acts on: a row's `NoteListItem`, or the page's `Note`. */
export type MenuNote = Pick<
  Note,
  'id' | 'title' | 'favoritedAt' | 'projectId' | 'linkedEventId' | 'linkedTaskId'
>;

/**
 * A note's row menu (right-click on a row or card, Figma `7175:29569`): Open note, Favorite,
 * Change link ›, Change project ›, Copy as Markdown, Move to trash.
 */
export function NoteMenuItems({
  note,
  actions,
  onOpen,
}: {
  note: MenuNote;
  actions: NoteActions;
  onOpen: () => void;
}) {
  return (
    <>
      <DropdownMenuItem icon={SquareArrowOutUpRight} shortcut="↵" onClick={onOpen}>
        Open note
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Star} shortcut="F" onClick={() => actions.toggleFavorite([note])}>
        {note.favoritedAt ? 'Unfavorite' : 'Favorite'}
      </DropdownMenuItem>
      <LinkSubmenu note={note} label="Change link" onPick={(link) => actions.setLink(note, link)} />
      <ProjectSubmenu
        projectId={note.projectId}
        label="Change project"
        onPick={(projectId) => actions.setProject([note], projectId)}
      />
      <DropdownMenuItem icon={Code} onClick={() => actions.copyAsMarkdown(note)}>
        Copy as Markdown
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        icon={Trash2}
        shortcut={TRASH}
        variant="destructive"
        onClick={() => actions.trash([note])}
      >
        Move to trash
      </DropdownMenuItem>
    </>
  );
}
