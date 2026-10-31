import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// Archiving and restoring tasks, projects and notes, and the archive view's list. A task or project
// takes what hangs off it along (subtasks, its tasks, linked notes); the response's `changed` names
// each kind of row the cascade stamped. Deleting for good, archived or not, is each entity's own
// `delete` (tasks.delete, projects.delete, notes.delete).

const taskId = z.object({ id: zId('task') });
const projectId = z.object({ id: zId('project') });
const noteId = z.object({ id: zId('note') });

export const archiveRouter = t.router({
  archiveTask: wsProcedure
    .input(taskId)
    .mutation(({ ctx, input }) => ctx.workspace.archive.archiveTask(input.id)),

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
