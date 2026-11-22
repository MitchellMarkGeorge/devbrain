import { FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { TrashSelection } from '@common/types';
import { ConfirmDialogItems, Icon, StatusIcon } from '@renderer/components';
import { trpc } from '@renderer/ipc';

// rows listed before "and N more"
const MAX_ROWS = 6;

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * In the confirmation before moving to the trash: what goes along with the rows chosen (a task's
 * subtasks, a project's tasks, and the notes linked to them), read with `archive.previewArchive`.
 * Draws nothing until it has loaded, or when nothing else goes.
 */
export function TrashPreview({ selection }: { selection: TrashSelection }) {
  const { data } = useQuery(trpc.archive.previewArchive.queryOptions(selection));
  if (!data || data.tasks.length + data.notes.length === 0) return null;
  // a chosen project's tasks are its own, not subtasks
  const taskNoun = selection.projectIds.length > 0 ? 'task' : 'subtask';
  const counts = [
    data.tasks.length > 0 ? count(data.tasks.length, taskNoun) : undefined,
    data.notes.length > 0 ? count(data.notes.length, 'note') : undefined,
  ].filter((part) => part !== undefined);
  const tasks = data.tasks.map((task) => ({
    key: task.id,
    icon: <StatusIcon status={task.status} />,
    label: task.title,
  }));
  const notes = data.notes.map((note) => ({
    key: note.id,
    icon: <Icon icon={FileText} size={16} />,
    label: note.title,
  }));
  // tasks first, keeping up to two rows for notes so many subtasks don't hide them all
  const noteRows = Math.min(notes.length, Math.max(2, MAX_ROWS - tasks.length));
  const taskRows = MAX_ROWS - noteRows;
  return (
    <ConfirmDialogItems
      label={`Also moves ${counts.join(' and ')}`}
      max={MAX_ROWS}
      items={[
        ...tasks.slice(0, taskRows),
        ...notes.slice(0, noteRows),
        ...tasks.slice(taskRows),
        ...notes.slice(noteRows),
      ]}
    />
  );
}
