import { z } from 'zod';
import type { ArchivePreview, EmptyTrashResult, RestoreResult } from '@common/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// Archiving and restoring tasks, projects and notes, and the archive view's list. A task or project
// takes what hangs off it along (subtasks, its tasks, linked notes); the response's `changed` names
// each kind of row the cascade stamped. Deleting an archived item for good is each entity's own
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

export const archiveRouter = t.router({
  archiveTask: wsProcedure
    .input(taskId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.archiveTask(input.id)),

  // the selection bar's archive: every task with its subtree and notes, all or nothing (one synced,
  // missing or already archived task fails the call and archives none)
  archiveTasks: wsProcedure
    .input(z.object({ ids: z.array(zId('task')).min(1) }))
    .mutation(({ ctx, input }) => ctx.workspace.archive.archiveTasks(input.ids)),

  // what moving the rows chosen to the trash would take along (subtasks, a project's tasks, linked
  // notes), shown in the confirmation before it; reads only
  previewArchive: wsProcedure
    .input(
      z.object({
        taskIds: z.array(zId('task')),
        projectIds: z.array(zId('project')),
        noteIds: z.array(zId('note')),
      }),
    )
    .query(({ ctx, input }): ArchivePreview => ctx.workspace.archive.previewArchive(input)),

  restoreTask: wsProcedure
    .input(taskId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.restoreTask(input.id)),

  archiveProject: wsProcedure
    .input(projectId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.archiveProject(input.id)),

  restoreProject: wsProcedure
    .input(projectId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.restoreProject(input.id)),

  archiveNote: wsProcedure
    .input(noteId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.archiveNote(input.id)),

  restoreNote: wsProcedure
    .input(noteId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.restoreNote(input.id)),

  // Trash's selection bar: restores the rows chosen, each with what its own restore brings back, all
  // or nothing (one missing or not in the trash fails the call and restores none). A row another
  // one's cascade restores (a task of a chosen project) is restored once, not refused.
  restoreMany: wsProcedure
    .input(trashSelection)
    .mutation(({ ctx, input }): RestoreResult => ctx.workspace.archive.restoreMany(input)),

  // Trash's selection bar: deletes the rows chosen for good, as emptyTrash does the whole trash
  // (the same rules and response), all or nothing (one missing or not in the trash fails the call
  // and deletes none). Confirming first is the renderer's.
  deleteMany: wsProcedure
    .input(trashSelection)
    .mutation(
      ({ ctx, input }): Promise<EmptyTrashResult> => ctx.workspace.archive.deleteMany(input),
    ),

  // Empties the trash: deletes every archived task, project and note for good, then the notes'
  // files, and returns the ids removed. An archived task with an active or synced task below it
  // stays (`keptTaskIds`); a note file that can't be removed is listed in `filesNotRemoved`, its
  // note deleted all the same. Confirming first (general.confirmBeforeDeleting) is the renderer's.
  emptyTrash: wsProcedure.mutation(
    ({ ctx }): Promise<EmptyTrashResult> => ctx.workspace.archive.emptyTrash(),
  ),

  // a page of archived rows, most recently archived first, each cascaded row in its own right
  listArchived: wsProcedure
    .input(
      z.object({
        entityType: z.enum(['tasks', 'projects', 'notes', 'all']).optional(),
        ...zPageFields,
      }),
    )
    .query(({ ctx, input: { entityType, ...page } }) =>
      ctx.workspace.archive.listArchived({ entityType }, page),
    ),
});
