import { useCallback, useMemo } from 'react';
import type { ArchivedEntity, EmptyTrashResult } from '@common/types';
import { isId } from '@common/ids';
import { toast } from '../../components';
import { ipc } from '../../ipc';
import { useConfirm } from '../app/use-confirm';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useOpenEntity } from '../app/use-open-entity';

// What Trash does to its rows (docs/deleting.md): restore one, delete one for good, or empty the
// whole trash. Each write goes straight to core; what it changed comes back in its `changed`, so
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
  /** restores it, then offers to open it */
  restore(item: TrashEntry): Promise<void>;
  /** deletes it for good, after asking; resolves to whether it went */
  remove(item: TrashEntry): Promise<boolean>;
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

  return useMemo(
    () => ({
      open,
      async restore(item) {
        try {
          await restore(item);
        } catch (error) {
          showError(error, `Couldn’t restore “${item.title}”`);
          return;
        }
        toast({
          tone: 'success',
          title: `Restored “${item.title}”`,
          description: `It’s back in ${PLACE[item.entityType]}.`,
          action: { label: 'Open', onClick: () => open(item) },
        });
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
    }),
    [confirm, showError, open],
  );
}
