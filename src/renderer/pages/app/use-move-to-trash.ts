import { useCallback } from 'react';
import { isId, type NoteId, type ProjectId, type TaskId } from '@common/ids';
import { toast } from '../../components';
import { ipc } from '../../ipc';
import { useUndoStack, type Undoable } from '../../keyboard';
import { useConfirm } from './use-confirm';
import { useMutationErrorToast } from './mutation-errors';

/** What can be moved to the trash: a task, project or note, by its prefixed id. */
export interface TrashItem {
  id: TaskId | ProjectId | NoteId;
  title: string;
}

function describe(items: readonly TrashItem[]): string {
  if (items.length === 1) return `“${items[0].title}”`;
  const kinds = new Set(items.map((item) => item.id.slice(0, 3)));
  const noun =
    kinds.size > 1
      ? 'items'
      : isId('task', items[0].id)
        ? 'tasks'
        : isId('project', items[0].id)
          ? 'projects'
          : 'notes';
  return `${items.length} ${noun}`;
}

async function archive(items: readonly TrashItem[]): Promise<void> {
  const tasks = items.flatMap((item) => (isId('task', item.id) ? [item.id] : []));
  // the selection bar's tasks go in one call, all or nothing
  if (tasks.length > 1) await ipc.archive.archiveTasks.mutate({ ids: tasks });
  else if (tasks.length === 1) await ipc.archive.archiveTask.mutate({ id: tasks[0] });
  for (const { id } of items) {
    if (isId('project', id)) await ipc.archive.archiveProject.mutate({ id });
    else if (isId('note', id)) await ipc.archive.archiveNote.mutate({ id });
  }
}

async function restore(items: readonly TrashItem[]): Promise<void> {
  for (const { id } of items) {
    if (isId('task', id)) await ipc.archive.restoreTask.mutate({ id });
    else if (isId('project', id)) await ipc.archive.restoreProject.mutate({ id });
    else await ipc.archive.restoreNote.mutate({ id: id as NoteId });
  }
}

/**
 * Moves tasks, projects or notes to the trash, asking first when `confirmBeforeArchiving` is on,
 * then shows "Moved to trash · Undo" (Figma `7175:33810`). The undo goes on the app's undo stack
 * (⌘Z), and the toast's Undo takes back that one change. Resolves to whether they moved. A failure
 * shows the error toast and moves nothing.
 */
export function useMoveToTrash(): (items: readonly TrashItem[]) => Promise<boolean> {
  const confirm = useConfirm();
  const undoStack = useUndoStack();
  const showError = useMutationErrorToast();
  return useCallback(
    async (items) => {
      if (items.length === 0) return false;
      const what = describe(items);
      const ok = await confirm({
        kind: 'archive',
        title: `Move ${what} to trash?`,
        description: 'You can restore it from Trash.',
        actionLabel: 'Move to Trash',
      });
      if (!ok) return false;
      try {
        await archive(items);
      } catch (error) {
        showError(error, `Couldn’t move ${what} to trash`);
        return false;
      }
      // Vim's Ctrl-r moves them again, with no second confirmation: they were confirmed once
      const entry: Undoable = {
        label: `Moved ${what} to trash`,
        undo: () => restore(items),
        redo: () => archive(items),
      };
      undoStack.push(entry);
      toast({
        tone: 'success',
        title: items.length === 1 ? 'Moved to trash' : `Moved ${what} to trash`,
        description: items.length === 1 ? items[0].title : undefined,
        action: {
          label: 'Undo',
          onClick: () => {
            undoStack
              .take(entry)
              .catch((error: unknown) => showError(error, `Couldn’t restore ${what}`));
          },
        },
      });
      return true;
    },
    [confirm, undoStack, showError],
  );
}
