import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ellipsis } from 'lucide-react';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { TaskStatus, type AppSettings, type TaskPriority, type TaskSummary } from '@common/types';
import {
  Button,
  CreateDialogBody,
  CreateDialogContent,
  CreateDialogDescriptionInput,
  CreateDialogFields,
  CreateDialogFooter,
  CreateDialogProperties,
  CreateDialogTitleInput,
  defaultQuickPicks,
  Dialog,
  DialogClose,
  DraftTaskList,
  DraftTaskRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EntityPill,
  IconButton,
  toast,
  useFormat,
} from '../../../components';
import { ipc, trpc } from '../../../ipc';
import { KeyScope } from '../../../keyboard';
import type { ModalProps } from '../../../modals';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { DatePill, PriorityPill, ProjectPill, StatusPill } from '../menus/pickers';

/** Where the dialog was opened from, filling in its properties. */
export interface CreateTaskDefaults {
  status?: TaskStatus;
  priority?: TaskPriority;
  /** null: no due date, over the setting's default */
  dueDate?: Date | null;
  projectId?: ProjectId | null;
  linkedEventId?: EventId;
  linkedNoteId?: NoteId;
}

export interface CreateTaskDialogProps extends ModalProps {
  /** a subtask's dialog: "Subtask of" this task, which gives it its project and links */
  parent?: TaskSummary;
  defaults?: CreateTaskDefaults;
  /** the task was created: "Open" in its toast */
  onOpenTask?: (id: TaskId) => void;
}

/** The setting's default due date ("today", "tomorrow", "next week"), as a day from `today`. */
export function defaultDueDate(
  setting: AppSettings['tasks']['defaultDueDate'] | undefined,
  today: Date,
): Date | null {
  if (!setting) return null;
  const [day, tomorrow, nextWeek] = defaultQuickPicks(today).map((pick) => pick.date);
  return setting === 'today' ? day : setting === 'tomorrow' ? tomorrow : nextWeek;
}

/**
 * New task, or new subtask (Figma `7175:39512`, `7175:41654`): the title, a description, the
 * properties as pills (status, priority, due date, project; a subtask's parent instead of the
 * project), then "…" for the start date and subtasks typed ahead. Its defaults come from the
 * settings (`tasks.defaultPriority`, `tasks.defaultDueDate`) and from where it was opened. The due
 * date is optional. ⌘↵ or Enter in the title creates it; with "Create more" on, the dialog stays
 * open, empty, for the next one.
 */
export function CreateTaskDialog({
  parent,
  defaults = {},
  onOpenTask,
  ...modal
}: CreateTaskDialogProps) {
  const settings = useQuery(trpc.settings.get.queryOptions()).data;
  const { now } = useFormat();
  const showError = useMutationErrorToast();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(defaults.status ?? TaskStatus.NOT_STARTED);
  const [priority, setPriority] = useState<TaskPriority>(
    defaults.priority ?? settings?.tasks.defaultPriority ?? (1 as TaskPriority),
  );
  const [dueDate, setDueDate] = useState<Date | null>(() =>
    defaults.dueDate !== undefined
      ? defaults.dueDate
      : defaultDueDate(settings?.tasks.defaultDueDate, now),
  );
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [projectId, setProjectId] = useState<ProjectId | null>(defaults.projectId ?? null);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const kind = parent ? 'subtask' : 'task';
  const canCreate = title.trim().length > 0 && !saving;

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    const fields = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      dueDate,
      startDate: startDate ?? undefined,
    };
    try {
      const task = parent
        ? await ipc.tasks.createSubtask.mutate({ parentTaskId: parent.id, ...fields })
        : await ipc.tasks.create.mutate({
            ...fields,
            projectId: projectId ?? undefined,
            linkedEventId: defaults.linkedEventId,
            linkedNoteId: defaults.linkedNoteId,
          });
      for (const subtask of subtasks) {
        await ipc.tasks.createSubtask.mutate({ parentTaskId: task.id, title: subtask });
      }
      toast({
        tone: 'success',
        title: parent ? 'Subtask created' : 'Task created',
        description: task.title,
        action: onOpenTask && { label: 'Open', onClick: () => onOpenTask(task.id) },
      });
      if (createMore) {
        setTitle('');
        setDescription('');
        setSubtasks([]);
        titleRef.current?.focus();
      } else {
        modal.onOpenChange(false);
      }
    } catch (error) {
      showError(error, `Couldn’t create the ${kind}`);
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void create();
  }

  // ⌘↵ anywhere in the dialog creates
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void create();
    }
  }

  return (
    <Dialog {...modal}>
      <CreateDialogContent
        aria-label={parent ? 'New subtask' : 'New task'}
        initialFocus={titleRef}
        onKeyDown={onKeyDown}
      >
        <KeyScope name="dialog">
          <form onSubmit={onSubmit}>
            <CreateDialogBody>
              <CreateDialogFields>
                <CreateDialogTitleInput
                  ref={titleRef}
                  placeholder={parent ? 'Subtask title' : 'Task title'}
                  aria-label="Title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
                <CreateDialogDescriptionInput
                  placeholder="Add description…"
                  aria-label="Description"
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </CreateDialogFields>
              <CreateDialogProperties
                more={
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <IconButton size="xs" tone="muted" icon={Ellipsis} label="More fields" />
                      }
                    />
                    <DropdownMenuContent align="end" width="sm">
                      <DropdownMenuItem disabled={showStart} onClick={() => setShowStart(true)}>
                        Add start date
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={showSubtasks}
                        onClick={() => setShowSubtasks(true)}
                      >
                        Add subtasks
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                {parent && (
                  <EntityPill
                    prefix="Subtask of"
                    entity={{ type: 'parent', title: parent.title, status: parent.status }}
                  />
                )}
                <StatusPill value={status} onChange={setStatus} />
                <PriorityPill value={priority} onChange={setPriority} />
                {(showStart || startDate) && (
                  <DatePill
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="Start date"
                    prefix="Starts"
                  />
                )}
                <DatePill value={dueDate} onChange={setDueDate} prefix="Due" />
                {!parent && <ProjectPill value={projectId} onChange={setProjectId} />}
              </CreateDialogProperties>
              {(showSubtasks || subtasks.length > 0) && (
                <DraftTaskList
                  label="Subtasks"
                  count={subtasks.length}
                  placeholder="Add a subtask…"
                  onAdd={(text) => setSubtasks((list) => [...list, text])}
                >
                  {subtasks.map((text, index) => (
                    <DraftTaskRow
                      key={`${index}:${text}`}
                      title={text}
                      onRemove={() => setSubtasks((list) => list.filter((_, i) => i !== index))}
                    />
                  ))}
                </DraftTaskList>
              )}
            </CreateDialogBody>
            <CreateDialogFooter createMore={createMore} onCreateMoreChange={setCreateMore}>
              <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!canCreate}>
                {parent ? 'Create Subtask' : 'Create Task'}
              </Button>
            </CreateDialogFooter>
          </form>
        </KeyScope>
      </CreateDialogContent>
    </Dialog>
  );
}
