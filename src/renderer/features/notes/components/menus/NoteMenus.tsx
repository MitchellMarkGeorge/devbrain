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
  DropdownMenuEmpty,
  DropdownMenuFilter,
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
  resolveColor,
  StatusIcon,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { ProjectSubmenu } from '@renderer/features/tasks/components/menus/TaskMenus';
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

/** The tasks a note can link to, or be linked from: open tasks, the 100 changed last. */
const linkTasksQuery = () =>
  trpc.tasks.list.queryOptions({
    filter: { excludeClosed: true },
    sort: { sortBy: 'updatedAt', direction: 'desc' },
    limit: 100,
  });

/**
 * Link to › an event (the last week and the next four) or a task (open, the 100 changed last),
 * searched by title; "Remove link" when the note has one.
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
  // a series is one row, however often it repeats
  const eventRows = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? []).filter((event) => !seen.has(event.id) && seen.add(event.id));
  }, [events.data]);
  const taskRows = tasks.data?.items ?? [];
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
            {eventRows.map((event) => (
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
        {taskRows.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Tasks</DropdownMenuLabel>
            {taskRows.map((task) => (
              <DropdownMenuItem
                key={task.id}
                icon={<StatusIcon status={task.status} />}
                shortcut={task.dueDate ? formatDate(task.dueDate) : undefined}
                onClick={() => onPick({ linkedTaskId: task.id })}
              >
                {task.title}
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
    <DropdownMenuFilter>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Link}>{label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="lg">
          <NoteLinkItems note={note} onPick={onPick} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuFilter>
  );
}

/** The open tasks a note can be linked from, searched by title, leaving out those already linked. */
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
  const candidates = (tasks.data?.items ?? []).filter((task) => !exclude.has(task.id));
  return (
    <>
      <DropdownMenuSearch aria-label="Search tasks" placeholder="Link a task…" />
      <DropdownMenuList>
        {candidates.map((task) => (
          <DropdownMenuItem
            key={task.id}
            icon={<StatusIcon status={task.status} />}
            shortcut={task.dueDate ? formatDate(task.dueDate) : undefined}
            onClick={() => onPick(task.id)}
          >
            {task.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty>No tasks match</DropdownMenuEmpty>
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
    <DropdownMenuFilter>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent width="lg" align="end">
          <TaskPickerItems exclude={exclude} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuFilter>
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
    <DropdownMenuFilter>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger icon={Link}>Link existing task</DropdownMenuSubTrigger>
        <DropdownMenuSubContent width="lg">
          <TaskPickerItems exclude={exclude} onPick={onPick} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuFilter>
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
        onClick={() => void actions.trash([note])}
      >
        Move to trash
      </DropdownMenuItem>
    </>
  );
}
