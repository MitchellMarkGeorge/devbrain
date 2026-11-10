import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ProjectId } from '@common/ids';
import { ProjectStatus } from '@common/types';
import {
  Button,
  CreateDialogBody,
  CreateDialogContent,
  CreateDialogDescriptionInput,
  CreateDialogFields,
  CreateDialogFooter,
  CreateDialogProperties,
  CreateDialogTitleInput,
  Dialog,
  DialogClose,
  DraftTaskList,
  DraftTaskRow,
  toast,
} from '../../../components';
import { ipc } from '../../../ipc';
import { KeyScope } from '../../../keyboard';
import type { ModalProps } from '../../../modals';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { SWATCH_HEX } from '../../../workspace/colors';
import { DatePill } from '../../tasks/menus/pickers';
import { ColourPill } from '../colour';
import { ProjectStatusPill } from '../ProjectStatusPill';

export interface CreateProjectDialogProps extends ModalProps {
  /** the project was created: the caller opens it */
  onCreated?: (id: ProjectId) => void;
}

/**
 * New project (Figma `7175:42128`): the name, a description, the properties as pills (status,
 * start and due dates, colour), then its first tasks typed ahead in a `DraftTaskList`. One
 * `projects.create` creates the project and its tasks together (C4). ⌘↵ or Enter in the name
 * creates it, then the project opens.
 */
export function CreateProjectDialog({ onCreated, ...modal }: CreateProjectDialogProps) {
  const showError = useMutationErrorToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(ProjectStatus.NOT_STARTED);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [color, setColor] = useState(SWATCH_HEX.blue);
  const [tasks, setTasks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const canCreate = title.trim().length > 0 && !saving;

  async function create() {
    if (!canCreate) return;
    setSaving(true);
    try {
      const project = await ipc.projects.create.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        startDate: startDate ?? undefined,
        dueDate,
        color,
        tasks: tasks.map((task) => ({ title: task })),
      });
      toast({ tone: 'success', title: 'Project created', description: project.title });
      modal.onOpenChange(false);
      onCreated?.(project.id);
    } catch (error) {
      showError(error, 'Couldn’t create the project');
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
      <CreateDialogContent aria-label="New project" initialFocus={titleRef} onKeyDown={onKeyDown}>
        <KeyScope name="dialog">
          <form onSubmit={onSubmit}>
            <CreateDialogBody>
              <CreateDialogFields>
                <CreateDialogTitleInput
                  ref={titleRef}
                  placeholder="Project name"
                  aria-label="Name"
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
              <CreateDialogProperties>
                <ProjectStatusPill status={status} onChange={setStatus} />
                <DatePill
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Start date"
                  prefix="Starts"
                />
                <DatePill value={dueDate} onChange={setDueDate} prefix="Due" />
                <ColourPill color={color} onChange={setColor} />
              </CreateDialogProperties>
              <DraftTaskList
                label="Tasks"
                count={tasks.length}
                placeholder="Add a task…"
                onAdd={(text) => setTasks((list) => [...list, text])}
              >
                {tasks.map((text, index) => (
                  <DraftTaskRow
                    key={`${index}:${text}`}
                    title={text}
                    onRemove={() => setTasks((list) => list.filter((_, i) => i !== index))}
                  />
                ))}
              </DraftTaskList>
            </CreateDialogBody>
            <CreateDialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={!canCreate}>
                Create Project
              </Button>
            </CreateDialogFooter>
          </form>
        </KeyScope>
      </CreateDialogContent>
    </Dialog>
  );
}
