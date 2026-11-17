import { z } from 'zod';
import type { EmptyTrashResult, RestoreResult } from '@common/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// Trashing and restoring tasks, projects and notes, and the trash view's list. A task or project
// takes what hangs off it along (subtasks, its tasks, linked notes); the response's `changed` names
// each kind of row the cascade stamped. Deleting a trashed item for good is each entity's own
// `delete` (tasks.delete, projects.delete, notes.delete); several at once, or the whole trash, are
// deleted here (deleteMany, emptyTrash).

const taskId = z.object({ id: zId('task') });
const projectId = z.object({ id: zId('project') });
const noteId = z.object({ id: zId('note') });

// rows chosen in Trash, by kind; at least one
const trashSelection = z
  .object({
    taskIds: z.array(zId('task')),
    projectIds: z.array(zId('project')),
    noteIds: z.array(zId('note')),
  })
  .refine((ids) => ids.taskIds.length + ids.projectIds.length + ids.noteIds.length > 0, {
    message: 'Choose at least one item',
  });

export const trashRouter = t.router({
  trashTask: wsProcedure
    .input(taskId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.trashTask(input.id)),

  // the selection bar's trash: every task with its subtree and notes, all or nothing (one synced,
  // missing or already trashed task fails the call and trashes none)
  trashTasks: wsProcedure
    .input(z.object({ ids: z.array(zId('task')).min(1) }))
    .mutation(({ ctx, input }) => ctx.workspace.trash.trashTasks(input.ids)),

  restoreTask: wsProcedure
    .input(taskId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.restoreTask(input.id)),

  trashProject: wsProcedure
    .input(projectId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.trashProject(input.id)),

  restoreProject: wsProcedure
    .input(projectId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.restoreProject(input.id)),

  trashNote: wsProcedure
    .input(noteId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.trashNote(input.id)),

  restoreNote: wsProcedure
    .input(noteId)
    .mutation(({ ctx, input }) => ctx.workspace.trash.restoreNote(input.id)),

  // Trash's selection bar: restores the rows chosen, each with what its own restore brings back, all
  // or nothing (one missing or not in the trash fails the call and restores none). A row another
  // one's cascade restores (a task of a chosen project) is restored once, not refused.
  restoreMany: wsProcedure
    .input(trashSelection)
    .mutation(({ ctx, input }): RestoreResult => ctx.workspace.trash.restoreMany(input)),

  // Trash's selection bar: deletes the rows chosen for good, as emptyTrash does the whole trash
  // (the same rules and response), all or nothing (one missing or not in the trash fails the call
  // and deletes none). Confirming first is the renderer's.
  deleteMany: wsProcedure
    .input(trashSelection)
    .mutation(({ ctx, input }): Promise<EmptyTrashResult> => ctx.workspace.trash.deleteMany(input)),

  // Empties the trash: deletes every trashed task, project and note for good, then the notes'
  // files, and returns the ids removed. A trashed task with an active or synced task below it
  // stays (`keptTaskIds`); a note file that can't be removed is listed in `filesNotRemoved`, its
  // note deleted all the same. Confirming first (general.confirmBeforeDeleting) is the renderer's.
  emptyTrash: wsProcedure.mutation(
    ({ ctx }): Promise<EmptyTrashResult> => ctx.workspace.trash.emptyTrash(),
  ),

  // a page of trashed rows, most recently trashed first, each cascaded row in its own right
  listTrashed: wsProcedure
    .input(
      z.object({
        entityType: z.enum(['tasks', 'projects', 'notes', 'all']).optional(),
        ...zPageFields,
      }),
    )
    .query(({ ctx, input: { entityType, ...page } }) =>
      ctx.workspace.trash.listTrashed({ entityType }, page),
    ),
});
