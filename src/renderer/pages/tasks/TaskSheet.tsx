import { useState, type KeyboardEvent } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Folder } from 'lucide-react';
import type { TaskId } from '@common/ids';
import type { Task } from '@common/types';
import {
  Button,
  DetailRow,
  DetailRows,
  EntityPill,
  PRIORITY_LABELS,
  PriorityIcon,
  ReadOnlyRow,
  resolveColor,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
  Skeleton,
  Stack,
  StatusIcon,
  SyncedBadge,
  TASK_STATUS_LABELS,
  Text,
  useFormat,
  useWorkspaceShell,
} from '../../components';
import { trpc } from '../../ipc';
import { ipcErrorCode } from '../../workspace/errors';
import { useDockedSheet } from '../app/docked-sheet';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';
import { DatePill, PriorityPill, ProjectPill, StatusPill } from './pickers';
import { isSynced, listedTask } from './queries';
import { useTaskActions } from './use-task-actions';
import styles from './TaskSheet.module.css';
import { TaskNoteSection } from './TaskNoteSection';
import { TaskSubtasksSection } from './TaskSubtasksSection';

declare module '@tanstack/history' {
  interface HistoryState {
    /** the board opened the sheet with this entry: Back (and the sheet's close) goes back to it */
    openedSheet?: boolean;
  }
}

export interface TaskSheetProps {
  taskId: TaskId;
  /** closes the sheet (removes `open` from the URL) */
  onClose: () => void;
}

/**
 * The task sheet over the board (`?open=tsk_…`, Figma `7175:31599`): docked beside the board in
 * wide and medium windows (the shell's sheet column), floating in compact ones. Its ⤢ opens the
 * task's page. Closing goes back when the board pushed the sheet's entry, so Back and × agree;
 * a sheet opened from a link closes in place.
 */
export function TaskSheet({ taskId, onClose }: TaskSheetProps) {
  const router = useRouter();
  const { size, sheetContainer } = useWorkspaceShell();
  const floating = size === 'compact';
  useDockedSheet(!floating);
  const openEntity = useOpenEntity();
  const openedHere = useRouterState({ select: (state) => state.location.state.openedSheet });
  const queryClient = useQueryClient();
  // drawn at once from the board's own row while the task itself loads, so moving from one task
  // to another never flashes the skeleton
  const query = useQuery({
    ...trpc.tasks.get.queryOptions({ id: taskId }),
    placeholderData: () => listedTask(queryClient, taskId),
  });

  const close = () => {
    if (openedHere) router.history.back();
    else onClose();
  };

  return (
    <Sheet
      open
      variant={floating ? 'overlay' : 'docked'}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent container={floating ? undefined : sheetContainer} data-testid="task-sheet">
        <SheetHeader onOpenAsPage={query.data ? () => openEntity({ id: taskId }) : undefined}>
          Task
        </SheetHeader>
        <SheetBody>
          {query.data ? (
            <TaskSheetBody task={query.data} />
          ) : query.isError ? (
            <Text tone="muted">
              {ipcErrorCode(query.error) === 'not_found'
                ? 'This task was deleted, or moved to the trash.'
                : 'This task couldn’t be loaded.'}
            </Text>
          ) : (
            <Stack gap="3" aria-busy>
              <Skeleton height={20} width="70%" />
              <Skeleton height={16} width="50%" />
              <Skeleton height={16} width="60%" />
            </Stack>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// the title, editable in place for a local task: saved on Enter or when it loses focus
function SheetTitle({ task }: { task: Task }) {
  const [title, setTitle] = useState(task.title);
  const showError = useMutationErrorToast('Couldn’t rename the task');
  const rename = useMutation(trpc.tasks.update.mutationOptions({ onError: (e) => showError(e) }));
  if (isSynced(task)) return <SheetItemTitle>{task.title}</SheetItemTitle>;
  const save = () => {
    const next = title.trim();
    if (next && next !== task.title) rename.mutate({ id: task.id, title: next });
    else setTitle(task.title);
  };
  return (
    <SheetItemTitle>
      <input
        className={styles.titleInput}
        aria-label="Title"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        onBlur={save}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape' && title !== task.title) {
            event.stopPropagation();
            setTitle(task.title);
          }
        }}
      />
    </SheetItemTitle>
  );
}

// the linked event or note, as a pill that opens it
function LinkRow({ task }: { task: Task }) {
  const openEntity = useOpenEntity();
  const event = useQuery({
    ...trpc.events.get.queryOptions({ id: task.linkedEventId! }),
    enabled: task.linkedEventId !== null,
  });
  const note = useQuery({
    ...trpc.notes.get.queryOptions({ id: task.linkedNoteId! }),
    enabled: task.linkedNoteId !== null,
  });
  if (task.linkedEventId && event.data) {
    const linked = event.data;
    return (
      <DetailRow label="Event">
        <EntityPill
          interactive
          entity={{ type: 'event', title: linked.title, color: linked.color }}
          onClick={() => openEntity({ id: linked.id, startAt: linked.startAt })}
        />
      </DetailRow>
    );
  }
  if (task.linkedNoteId && note.data) {
    const linked = note.data;
    return (
      <DetailRow label="Note">
        <EntityPill
          interactive
          entity={{ type: 'note', title: linked.title || 'Untitled' }}
          onClick={() => openEntity({ id: linked.id })}
        />
      </DetailRow>
    );
  }
  return null;
}

/** The sheet's body for a loaded task. */
function TaskSheetBody({ task }: { task: Task }) {
  const actions = useTaskActions();
  const { formatDate, formatRelative } = useFormat('minute');
  const openUrl = useMutation(trpc.workspace.openUrl.mutationOptions());
  const synced = isSynced(task);
  const external = task.external;
  const project = useQuery({
    ...trpc.projects.get.queryOptions({ id: task.projectId! }),
    enabled: synced && task.projectId !== null,
  });

  return (
    <>
      <SheetTitle key={`${task.id}:${task.title}`} task={task} />
      {synced && external && (
        <SyncedBadge>Linear{external.key ? ` · ${external.key}` : ''}</SyncedBadge>
      )}
      <DetailRows>
        {synced ? (
          <>
            <ReadOnlyRow label="Status" glyph={<StatusIcon status={task.status} size={14} />}>
              {external?.statusLabel ?? TASK_STATUS_LABELS[task.status]}
            </ReadOnlyRow>
            <ReadOnlyRow
              label="Priority"
              glyph={<PriorityIcon priority={task.priority} size={14} />}
            >
              {external?.priorityLabel ?? PRIORITY_LABELS[task.priority]}
            </ReadOnlyRow>
            {task.dueDate && (
              <ReadOnlyRow label="Due date" glyph={CalendarDays}>
                {formatDate(task.dueDate)}
              </ReadOnlyRow>
            )}
            {project.data && (
              <ReadOnlyRow
                label="Project"
                glyph={Folder}
                glyphColor={resolveColor(project.data.color, 'blue')}
              >
                {project.data.title}
              </ReadOnlyRow>
            )}
          </>
        ) : (
          <>
            <DetailRow label="Status">
              <StatusPill value={task.status} onChange={(s) => actions.setStatus([task], s)} />
            </DetailRow>
            <DetailRow label="Priority">
              <PriorityPill
                value={task.priority}
                onChange={(p) => actions.setPriority([task], p)}
              />
            </DetailRow>
            <DetailRow label="Dates">
              <DatePill
                value={task.startDate}
                placeholder="Start date"
                prefix="Starts"
                onChange={(date) => actions.setStartDate(task, date)}
              />
              <DatePill
                value={task.dueDate}
                prefix="Due"
                onChange={(date) => actions.setDueDate([task], date)}
              />
            </DetailRow>
            <DetailRow label="Project">
              <ProjectPill
                value={task.projectId}
                onChange={(projectId) => actions.setProject([task], projectId)}
              />
            </DetailRow>
          </>
        )}
        <LinkRow task={task} />
      </DetailRows>
      {synced && external && (
        <div className={styles.syncHint}>
          <span className={styles.syncLine}>
            Synced from Linear {formatRelative(external.lastSyncedAt).toLowerCase()} · Edit in
            Linear
          </span>
          <div>
            <Button
              size="sm"
              icon={ExternalLink}
              onClick={() => openUrl.mutate({ url: external.url })}
            >
              Open in Linear
            </Button>
          </div>
        </div>
      )}
      <SheetDivider />
      {task.description ? (
        <p className={styles.description}>{task.description}</p>
      ) : (
        <p className={`${styles.description} ${styles.empty}`}>No description</p>
      )}
      <TaskSubtasksSection task={task} compact />
      <TaskNoteSection task={task} compact />
    </>
  );
}
