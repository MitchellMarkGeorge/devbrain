import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Calendar, CircleCheck, FileText, Folder, Plus } from 'lucide-react';
import type { Event } from '@common/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { useCreateNote } from '@renderer/features/notes/hooks/use-create-note';
import { useCreateProject } from '@renderer/features/projects/hooks/use-create-project';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import { useCreateEvent } from '@renderer/features/calendar/hooks/use-create-event';
import {
  defaultDurationMinutes,
  draftForDay,
} from '@renderer/features/calendar/components/create/CreateEventDialog';
import { openEventSearch } from '@renderer/features/calendar/api/search';
import { dateParam } from '@renderer/shared/lib/calendar';

/**
 * The title bar's New: "+", opening New task (C), New note (N) and New project, then New event, in
 * that order on every page. Each opens what the app's own key or page button does: Create task, a
 * new note, Create project, and New event from the next hour today, whose toast opens the event in
 * the calendar.
 */
export function CreateMenu() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const { now } = useFormat('minute');
  const settings = useQuery(trpc.settings.get.queryOptions()).data;
  const createTask = useCreateTask();
  const createNote = useCreateNote();
  const createProject = useCreateProject();
  const createEvent = useCreateEvent(
    useCallback(
      (event: Event) =>
        navigate({
          to: '/app/$workspaceId/calendar',
          params: { workspaceId },
          search: { ...openEventSearch(event.id), date: dateParam(event.startAt) },
        }),
      [navigate, workspaceId],
    ),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton size="sm" tone="muted" icon={Plus} label="New" />} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem icon={CircleCheck} shortcut="C" onClick={() => createTask()}>
          New task
        </DropdownMenuItem>
        <DropdownMenuItem icon={FileText} shortcut="N" onClick={() => createNote()}>
          New note
        </DropdownMenuItem>
        <DropdownMenuItem icon={Folder} onClick={() => createProject()}>
          New project
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Calendar}
          onClick={() => createEvent(draftForDay(now, now, defaultDurationMinutes(settings)))}
        >
          New event
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
