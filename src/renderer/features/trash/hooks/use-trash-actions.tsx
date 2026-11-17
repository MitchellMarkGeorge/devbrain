import { useCallback, useMemo } from 'react';
import type { ArchivedEntity, EmptyTrashResult, TrashSelection } from '@common/types';
import { isId } from '@common/ids';
import { toast } from '@renderer/components';
import { ipc } from '@renderer/ipc';
import { useConfirm } from '@renderer/shared/hooks/use-confirm';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';

// What Trash does to its rows (docs/deleting.md): restore one, delete one for good, or empty the
// whole trash; or restore or delete the selected rows together, in one call that core runs as one
// transaction (archive.restoreMany, archive.deleteMany). Each write goes straight to core; what it changed comes back in its `changed`, so
// the list refetches without help. Deleting asks first when `confirmBeforeDeleting` is on.

export type TrashEntry = Pick<ArchivedEntity, 'id' | 'entityType' | 'title'>;

const NOUN = { tasks: 'task', projects: 'project', notes: 'note' } as const;
const PLACE = { tasks: 'Tasks', projects: 'Projects', notes: 'Notes' } as const;

/** What deleting an item does to what links to it, as the confirmation says it. */
export function deleteConsequence(item: TrashEntry): string {
  const title = `“${item.title}”`;
  switch (item.entityType) {
    case 'tasks':
      return `${title} and its subtasks will be removed from the trash for good. Their task notes are kept.`;
    case 'projects':
      return `${title} will be removed from the trash for good. Its tasks and notes are kept and no longer belong to a project.`;
    case 'notes':
      return `${title} will be removed from the trash for good. Tasks linked to it are kept, without the link.`;
  }
}

async function restore(item: TrashEntry): Promise<void> {
  const { id } = item;
  if (isId('task', id)) await ipc.archive.restoreTask.mutate({ id });
  else if (isId('project', id)) await ipc.archive.restoreProject.mutate({ id });
  else if (isId('note', id)) await ipc.archive.restoreNote.mutate({ id });
}

async function remove(item: TrashEntry): Promise<void> {
  const { id } = item;
  if (isId('task', id)) await ipc.tasks.delete.mutate({ id });
  else if (isId('project', id)) await ipc.projects.delete.mutate({ id });
  else if (isId('note', id)) await ipc.notes.delete.mutate({ id });
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The rows' ids by kind, as archive.restoreMany and archive.deleteMany take them. */
export function selectionOf(items: readonly TrashEntry[]): TrashSelection {
  const selection: TrashSelection = { taskIds: [], projectIds: [], noteIds: [] };
  for (const { id } of items) {
    if (isId('task', id)) selection.taskIds.push(id);
    else if (isId('project', id)) selection.projectIds.push(id);
    else if (isId('note', id)) selection.noteIds.push(id);
  }
  return selection;
}

/** What deleting several items does to what links to them, as the confirmation says it. */
export function deleteAllConsequence(items: readonly TrashEntry[]): string {
  if (items.length === 1) return deleteConsequence(items[0]);
  return `${plural(items.length, 'item')} will be removed from the trash for good, with the subtasks of any task. Tasks and notes outside the trash that link to them are kept, without the link.`;
}

/** What emptying the trash did, in a toast's words: what went, and what stayed and why. */
export function emptyTrashSummary(result: EmptyTrashResult): {
  title: string;
  description?: string;
} {
  const deleted = result.taskIds.length + result.projectIds.length + result.noteIds.length;
  const notes: string[] = [];
  if (result.keptTaskIds.length > 0) {
    notes.push(
      `${plural(result.keptTaskIds.length, 'task')} stayed, as ${
        result.keptTaskIds.length === 1 ? 'it has' : 'they have'
      } subtasks outside the trash.`,
    );
  }
  if (result.filesNotRemoved.length > 0) {
    notes.push(
      `${plural(result.filesNotRemoved.length, 'note file')} couldn’t be removed from the notes folder.`,
    );
  }
  return {
    title: deleted === 0 ? 'Nothing was deleted' : `Deleted ${plural(deleted, 'item')}`,
    description: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

export interface TrashActions {
  /** restores it, then offers to open it; resolves to whether it is back */
  restore(item: TrashEntry): Promise<boolean>;
  /** deletes it for good, after asking; resolves to whether it went */
  remove(item: TrashEntry): Promise<boolean>;
  /** restores the selected rows, all or none; resolves to whether they are back */
  restoreAll(items: readonly TrashEntry[]): Promise<boolean>;
  /** deletes the selected rows for good, after asking once; resolves to whether the call went */
  removeAll(items: readonly TrashEntry[]): Promise<boolean>;
  /** deletes everything in the trash for good, after asking */
  empty(): Promise<void>;
  /** opens its page (read-only while it is in the trash) */
  open(item: TrashEntry): void;
}

export function useTrashActions(): TrashActions {
  const confirm = useConfirm();
  const showError = useMutationErrorToast();
  const openEntity = useOpenEntity();

  const open = useCallback((item: TrashEntry) => openEntity({ id: item.id }), [openEntity]);

  return useMemo(() => {
    const actions: TrashActions = {
      open,
      async restore(item) {
        try {
          await restore(item);
        } catch (error) {
          showError(error, `Couldn’t restore “${item.title}”`);
          return false;
        }
        toast({
          tone: 'success',
          title: `Restored “${item.title}”`,
          description: `It’s back in ${PLACE[item.entityType]}.`,
          action: { label: 'Open', onClick: () => open(item) },
        });
        return true;
      },
      async remove(item) {
        const noun = NOUN[item.entityType];
        const ok = await confirm({
          kind: 'delete',
          title: `Delete ${noun} permanently?`,
          description: deleteConsequence(item),
          irreversible: true,
          actionLabel: `Delete ${noun.charAt(0).toUpperCase()}${noun.slice(1)}`,
        });
        if (!ok) return false;
        try {
          await remove(item);
        } catch (error) {
          showError(error, `Couldn’t delete “${item.title}”`);
          return false;
        }
        toast({ title: `Deleted “${item.title}”` });
        return true;
      },
      async restoreAll(items) {
        if (items.length === 1) return actions.restore(items[0]);
        try {
          await ipc.archive.restoreMany.mutate(selectionOf(items));
        } catch (error) {
          showError(error, `Couldn’t restore the ${plural(items.length, 'item')}`);
          return false;
        }
        toast({
          tone: 'success',
          title: `Restored ${plural(items.length, 'item')}`,
          description: 'They’re back where they were.',
        });
        return true;
      },
      async removeAll(items) {
        if (items.length === 1) return actions.remove(items[0]);
        const ok = await confirm({
          kind: 'delete',
          title: `Delete ${plural(items.length, 'item')} permanently?`,
          description: deleteAllConsequence(items),
          irreversible: true,
          actionLabel: `Delete ${plural(items.length, 'Item')}`,
        });
        if (!ok) return false;
        let result: EmptyTrashResult;
        try {
          result = await ipc.archive.deleteMany.mutate(selectionOf(items));
        } catch (error) {
          showError(error, `Couldn’t delete the ${plural(items.length, 'item')}`);
          return false;
        }
        // what went, and what stayed and why (a task with live subtasks, a file left behind)
        toast({
          tone:
            result.keptTaskIds.length + result.filesNotRemoved.length > 0 ? 'warning' : undefined,
          ...emptyTrashSummary(result),
        });
        return true;
      },
      async empty() {
        const ok = await confirm({
          kind: 'delete',
          title: 'Empty the trash?',
          description:
            'Every task, project and note in the trash will be deleted for good. Items outside the trash that link to them are kept, without the link.',
          irreversible: true,
          actionLabel: 'Empty Trash',
        });
        if (!ok) return;
        let result: EmptyTrashResult;
        try {
          result = await ipc.archive.emptyTrash.mutate();
        } catch (error) {
          showError(error, 'Couldn’t empty the trash');
          return;
        }
        const summary = emptyTrashSummary(result);
        toast({
          tone:
            result.keptTaskIds.length + result.filesNotRemoved.length > 0 ? 'warning' : 'success',
          ...summary,
        });
      },
    };
    return actions;
  }, [confirm, showError, open]);
}
