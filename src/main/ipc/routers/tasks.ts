import { z } from 'zod';
import { safeUrlSchema } from '@common/safe-url';
import { TaskPriority, TaskStatus, type TaskDeleteResult } from '@main/core/tasks/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// Tasks, subtasks and their links. Archiving one is the archive router's; detach and reattach hand
// a synced task to the user and back (DetachService).

const byId = z.object({ id: zId('task') });

const title = z.string().trim().min(1);
const priority = z.enum(TaskPriority);
const status = z.enum(TaskStatus);

// core's TaskFilterOptions
const filter = z.object({
  status: status.optional(),
  // null: the tasks without one
  projectId: zId('project').nullable().optional(),
  noteId: zId('note').nullable().optional(),
  eventId: zId('event').nullable().optional(),
  priority: priority.optional(),
  dueOn: z.date().optional(),
  dueBefore: z.date().optional(),
  dueAfter: z.date().optional(),
  excludeSubtasks: z.boolean().optional(),
  excludeClosed: z.boolean().optional(),
  origin: z.enum(['local', 'external']).optional(),
});

// core's TaskSortOptions
const sort = z.object({
  sortBy: z.enum(['priority', 'dueDate', 'status', 'createdAt', 'updatedAt']),
  direction: z.enum(['asc', 'desc']).optional(),
});

// core's CreateSubTaskOptions
const subtaskFields = {
  title,
  description: z.string().optional(),
  priority: priority.optional(),
  status: status.optional(),
  dueDate: z.date().optional(),
  startDate: z.date().optional(),
};

// core's UpdateTaskLinkOptions: a task links to an event or a note, not both
const links = {
  linkedEventId: zId('event').nullable().optional(),
  linkedNoteId: zId('note').nullable().optional(),
};

export const tasksRouter = t.router({
  // a page of tasks; pass the previous page's nextCursor for the next
  list: wsProcedure
    .input(z.object({ filter: filter.optional(), sort: sort.optional(), ...zPageFields }))
    .query(({ ctx, input: { filter, sort, ...page } }) =>
      ctx.workspace.tasks.listTasks(filter, sort, page),
    ),

  get: wsProcedure.input(byId).query(({ ctx, input }) => ctx.workspace.tasks.getById(input.id)),

  // a page of the task's direct subtasks
  subtasks: wsProcedure
    .input(z.object({ id: zId('task'), ...zPageFields }))
    .query(({ ctx, input: { id, ...page } }) => ctx.workspace.tasks.listSubtasks(id, page)),

  create: wsProcedure
    .input(
      z.object({
        ...subtaskFields,
        dueDate: z.date(),
        projectId: zId('project').optional(),
        ...links,
      }),
    )
    .mutation(({ ctx, input }) => ctx.workspace.tasks.createTask(input)),

  // takes the parent's project and links, and its due date when none is given
  createSubtask: wsProcedure
    .input(z.object({ parentTaskId: zId('task'), ...subtaskFields }))
    .mutation(({ ctx, input: { parentTaskId, ...options } }) =>
      ctx.workspace.tasks.createSubtask(parentTaskId, options),
    ),

  // the fields core's UpdateTaskOptions holds; status, project, links and the hierarchy each have
  // their own route
  update: wsProcedure
    .input(
      z.object({
        id: zId('task'),
        title: title.optional(),
        description: z.string().optional(),
        priority: priority.optional(),
        startDate: z.date().optional(),
        dueDate: z.date().optional(),
        pullRequestUrl: safeUrlSchema.optional(),
      }),
    )
    .mutation(({ ctx, input: { id, ...updates } }) => ctx.workspace.tasks.updateTask(id, updates)),

  updateStatus: wsProcedure
    .input(z.object({ id: zId('task'), status }))
    .mutation(({ ctx, input }) => ctx.workspace.tasks.updateStatus(input.id, input.status)),

  // null takes the task out of its project
  updateProject: wsProcedure
    .input(z.object({ id: zId('task'), projectId: zId('project').nullable() }))
    .mutation(({ ctx, input }) => ctx.workspace.tasks.updateProject(input.id, input.projectId)),

  // replaces both links: one left out is cleared
  updateLinks: wsProcedure
    .input(z.object({ id: zId('task'), ...links }))
    .mutation(({ ctx, input: { id, ...options } }) => ctx.workspace.tasks.updateLinks(id, options)),

  // makes a subtask a top-level task
  promote: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }) => ctx.workspace.tasks.promoteSubtask(input.id)),

  // makes the task a subtask of `parentTaskId`; its subtree takes the new parent's project and links
  demote: wsProcedure
    .input(z.object({ id: zId('task'), parentTaskId: zId('task') }))
    .mutation(({ ctx, input }) => ctx.workspace.tasks.demoteTask(input.id, input.parentTaskId)),

  // the state wanted, not a toggle, so a double click or a stale view can't flip it back
  setFavorite: wsProcedure
    .input(z.object({ id: zId('task'), favorite: z.boolean() }))
    .mutation(({ ctx, input }) =>
      input.favorite
        ? ctx.workspace.favorites.favoriteTask(input.id)
        : ctx.workspace.favorites.unfavoriteTask(input.id),
    ),

  // Deletes an archived (trashed) task for good, else not_archived, with its subtasks at any depth: the response's
  // `taskIds` lists every one removed, for the renderer to drop. Its task notes are kept, unlinked
  // (`unlinkedNoteIds`). A synced task fails with external_read_only: detach it first. A detached
  // one is remembered, so sync does not bring it back while it stays assigned to the user. Asking
  // the user to confirm (general.confirmBeforeDeleting) is the renderer's.
  delete: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }): TaskDeleteResult => ctx.workspace.tasks.deleteTask(input.id)),

  // makes a synced task and its synced subtree local, editable copies
  detach: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }) => ctx.workspace.detach.detachTask(input.id)),

  // hands a detached task back to its provider and refreshes it from there; core moves the
  // integration to needs_reauth when the provider rejects its credentials
  reattach: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }) => ctx.workspace.detach.reattachTask(input.id)),
});
