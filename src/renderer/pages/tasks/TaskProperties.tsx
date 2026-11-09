import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Calendar,
  GitPullRequest,
  Pencil,
  Plus,
  Repeat,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { safeUrlSchema } from '@common/safe-url';
import { LinkState, type Task, type TaskSummary } from '@common/types';
import {
  DatePicker,
  DateRange,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityPill,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PRIORITY_LABELS,
  PriorityIcon,
  PropertyRow,
  PROVIDER_LABELS,
  providerOf,
  resolveColor,
  StatusIcon,
  SyncedBadge,
  TASK_ADD_ITEMS,
  TASK_STATUS_LABELS,
  dueTone,
  useFormat,
} from '../../components';
import { ipc, trpc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';
import { PriorityPill, ProjectPill, StatusPill } from './pickers';
import { isSynced } from './queries';
import { TaskLinkPicker, TaskParentPicker, type TaskLink } from './TaskLinkPicker';
import type { TaskActions } from './use-task-actions';

/** A short name for a pull request's URL: "#123" for GitHub's `/pull/123`, else its host and path. */
export function pullRequestLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const number = /\/pull\/(\d+)/.exec(parsed.pathname)?.[1];
    if (number) return `${parsed.pathname.split('/')[2] ?? ''}#${number}`;
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Sets a task's event or note link (`tasks.updateLinks`, which replaces both). */
export function useSetTaskLink(task: Pick<Task, 'id'>) {
  const showError = useMutationErrorToast();
  return (link: TaskLink) => {
    const links =
      link === null
        ? { linkedEventId: null, linkedNoteId: null }
        : 'linkedEventId' in link
          ? { linkedEventId: link.linkedEventId, linkedNoteId: null }
          : { linkedEventId: null, linkedNoteId: link.linkedNoteId };
    ipc.tasks.updateLinks
      .mutate({ id: task.id, ...links })
      .catch((error: unknown) => showError(error, 'Couldn’t change the link'));
  };
}

/** Makes the task a subtask of another (`tasks.demote`). */
export function useMakeSubtask(task: Pick<Task, 'id'>) {
  const showError = useMutationErrorToast();
  return (parentTaskId: Task['id']) =>
    ipc.tasks.demote
      .mutate({ id: task.id, parentTaskId })
      .catch((error: unknown) => showError(error, 'Couldn’t make it a subtask'));
}

// the linked event or note, as a pill opening a menu: open it, change it, remove it
function LinkPill({ task }: { task: Task }) {
  const openEntity = useOpenEntity();
  const setLink = useSetTaskLink(task);
  const [changing, setChanging] = useState(false);
  const event = useQuery({
    ...trpc.events.get.queryOptions({ id: task.linkedEventId! }),
    enabled: task.linkedEventId !== null,
  });
  const note = useQuery({
    ...trpc.notes.get.queryOptions({ id: task.linkedNoteId! }),
    enabled: task.linkedNoteId !== null,
  });
  const pill = event.data ? (
    <EntityPill
      interactive
      entity={{
        type: 'event',
        title: event.data.title,
        color: resolveColor(event.data.color) ?? null,
      }}
    />
  ) : note.data ? (
    <EntityPill interactive entity={{ type: 'note', title: note.data.title || 'Untitled' }} />
  ) : null;
  if (!pill) return null;
  const kind = event.data ? 'event' : 'note';
  if (changing) {
    return (
      <TaskLinkPicker
        task={task}
        kinds={[kind]}
        open
        onOpenChange={(open) => !open && setChanging(false)}
        trigger={pill}
        onPick={(link) => {
          setChanging(false);
          setLink(link);
        }}
      />
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          icon={SquareArrowOutUpRight}
          onClick={() =>
            event.data
              ? openEntity({ id: event.data.id, startAt: event.data.startAt })
              : note.data && openEntity({ id: note.data.id })
          }
        >
          {kind === 'event' ? 'Open event' : 'Open note'}
        </DropdownMenuItem>
        <DropdownMenuItem icon={Repeat} onClick={() => setChanging(true)}>
          {kind === 'event' ? 'Change linked event…' : 'Change linked note…'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={X} onClick={() => setLink(null)}>
          Remove link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// the pull request: a pill opening a menu (open, edit, remove), or the URL field while editing
function PullRequestPill({
  task,
  editing,
  onEditingChange,
  readOnly,
}: {
  task: Task;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  readOnly: boolean;
}) {
  const showError = useMutationErrorToast();
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  const [text, setText] = useState(task.pullRequestUrl ?? '');
  const [invalid, setInvalid] = useState(false);
  const save = (url: string | null) =>
    ipc.tasks.update
      .mutate({ id: task.id, pullRequestUrl: url })
      .catch((error: unknown) => showError(error, 'Couldn’t save the pull request'));

  const pill = (
    <EntityPill interactive glyph={GitPullRequest}>
      {task.pullRequestUrl ? pullRequestLabel(task.pullRequestUrl) : 'Pull request'}
    </EntityPill>
  );

  if (editing) {
    const submit = () => {
      const url = text.trim();
      if (url === '') {
        if (task.pullRequestUrl) void save(null);
        onEditingChange(false);
        return;
      }
      if (!safeUrlSchema.safeParse(url).success) {
        setInvalid(true);
        return;
      }
      void save(url);
      onEditingChange(false);
    };
    return (
      <Popover open onOpenChange={(open) => !open && onEditingChange(false)}>
        <PopoverTrigger render={pill} />
        <PopoverContent align="start">
          <Input
            autoFocus
            aria-label="Pull request URL"
            aria-invalid={invalid || undefined}
            placeholder="https://github.com/…/pull/123"
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
              setInvalid(false);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }
  if (!task.pullRequestUrl) return null;
  const url = task.pullRequestUrl;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={pill} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem icon={SquareArrowOutUpRight} onClick={() => openUrl({ url })}>
          Open pull request
        </DropdownMenuItem>
        {!readOnly && (
          <>
            <DropdownMenuItem icon={Pencil} onClick={() => onEditingChange(true)}>
              Edit link…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={X} onClick={() => void save(null)}>
              Remove pull request
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TaskPropertiesProps {
  task: Task;
  /** the task's parent, for a subtask */
  parent: TaskSummary | null;
  actions: TaskActions;
  /** the picker opened for a property being added ("+ Add", or the page's "…" menu) */
  adding: AddingProperty;
  onAddingChange: (adding: AddingProperty) => void;
}

/** A property being added: its picker shows on the links line until it is picked or dismissed. */
export type AddingProperty = 'parent' | 'event' | 'pull-request' | null;

/**
 * The pill rows under a task's title (`PropertyRow`): status, priority, the dates and the project,
 * then "+ Add" for what is unset (a parent, an event or note, a pull request); and on the second
 * line where it comes from (the synced badge), what it links to, its parent and its pull
 * request. A synced task shows its provider's values read-only and has no "+ Add"; its links stay
 * editable.
 */
export function TaskProperties({
  task,
  parent,
  actions,
  adding,
  onAddingChange: setAdding,
}: TaskPropertiesProps) {
  const { now, formatDate, formatRelative } = useFormat('minute');
  const openEntity = useOpenEntity();
  const setLink = useSetTaskLink(task);
  const makeSubtask = useMakeSubtask(task);
  const synced = isSynced(task);
  const external = task.external ?? null;
  const detached = external?.state === LinkState.DETACHED;
  const tasks = [task];
  const tone = dueTone(task.status, task.dueDate, now);

  const properties = synced ? (
    <>
      <EntityPill interactive={false} glyph={<StatusIcon status={task.status} size={12} />}>
        {external?.statusLabel ?? TASK_STATUS_LABELS[task.status]}
      </EntityPill>
      <EntityPill interactive={false} glyph={<PriorityIcon priority={task.priority} size={12} />}>
        {external?.priorityLabel ?? PRIORITY_LABELS[task.priority]}
      </EntityPill>
      {task.dueDate && (
        <EntityPill interactive={false} glyph={Calendar}>
          {formatDate(task.dueDate)}
        </EntityPill>
      )}
      {task.projectId && <ProjectPill value={task.projectId} onChange={() => {}} disabled />}
    </>
  ) : (
    <>
      <StatusPill value={task.status} onChange={(status) => actions.setStatus(tasks, status)} />
      <PriorityPill
        value={task.priority}
        onChange={(priority) => actions.setPriority(tasks, priority)}
      />
      <DateRange
        start={task.startDate ? formatDate(task.startDate) : undefined}
        due={task.dueDate ? formatDate(task.dueDate) : 'Due date'}
        dueTone={tone === 'today' || tone === 'overdue' ? tone : undefined}
        duePicker={
          <DatePicker
            today={now}
            value={task.dueDate ?? undefined}
            onChange={(date) => actions.setDueDate(tasks, date ?? null)}
            onClear={task.dueDate ? () => actions.setDueDate(tasks, null) : undefined}
          />
        }
        startPicker={
          <DatePicker
            today={now}
            value={task.startDate ?? undefined}
            onChange={(date) => actions.setStartDate(task, date ?? null)}
            onClear={task.startDate ? () => actions.setStartDate(task, null) : undefined}
          />
        }
      />
      <ProjectPill
        value={task.projectId}
        onChange={(projectId) => actions.setProject(tasks, projectId)}
      />
    </>
  );

  const linked = task.linkedEventId !== null || task.linkedNoteId !== null;
  const addItems = TASK_ADD_ITEMS.filter(
    (item) =>
      (item.key === 'parent' && !parent && !synced) ||
      (item.key === 'event' && !linked) ||
      (item.key === 'pull-request' && !task.pullRequestUrl),
  ).map((item) => (item.key === 'event' ? { ...item, label: 'Event or note' } : item));

  const links = (
    <>
      {external && (
        <SyncedBadge state={detached ? 'detached' : 'synced'} provider={providerOf(external)}>
          {PROVIDER_LABELS[providerOf(external) ?? 'linear']}
          {external.key ? ` · ${external.key}` : ''}
        </SyncedBadge>
      )}
      {linked && <LinkPill task={task} />}
      {adding === 'event' && !linked && (
        <TaskLinkPicker
          task={task}
          open
          onOpenChange={(open) => !open && setAdding(null)}
          trigger={
            <EntityPill interactive glyph={Plus}>
              Link to event or note
            </EntityPill>
          }
          onPick={(link) => {
            setAdding(null);
            setLink(link);
          }}
        />
      )}
      {parent && (
        <EntityPill
          interactive
          entity={{ type: 'parent', title: parent.title, status: parent.status }}
          onClick={() => openEntity({ id: parent.id })}
        />
      )}
      {adding === 'parent' && !parent && (
        <TaskParentPicker
          taskId={task.id}
          open
          onOpenChange={(open) => !open && setAdding(null)}
          trigger={
            <EntityPill interactive glyph={Plus}>
              Parent task
            </EntityPill>
          }
          onPick={(parentId) => {
            setAdding(null);
            void makeSubtask(parentId);
          }}
        />
      )}
      {(task.pullRequestUrl || adding === 'pull-request') && (
        <PullRequestPill
          key={task.pullRequestUrl ?? ''}
          task={task}
          readOnly={false}
          editing={adding === 'pull-request'}
          onEditingChange={(editing) => setAdding(editing ? 'pull-request' : null)}
        />
      )}
    </>
  );

  const note = external
    ? detached
      ? 'Edits stay in DevBrain'
      : `Synced ${formatRelative(external.lastSyncedAt).toLowerCase()}`
    : undefined;

  return (
    <PropertyRow
      properties={properties}
      links={links}
      note={note}
      addable={!synced}
      addItems={addItems}
      onAdd={(key) => setAdding(key as AddingProperty)}
    />
  );
}
