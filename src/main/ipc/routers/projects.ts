import { z } from 'zod';
import { hexColorSchema } from '@common/color';
import {
  ProjectStatus,
  type Project,
  type ProjectDeleteResult,
  type ProjectStats,
} from '@main/core/projects/types';
import type { Page } from '@main/core/shared/pagination';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// The workspace's active projects. A synced project is read-only: its writes fail with
// external_read_only.

const byId = z.object({ id: zId('project') });

const title = z.string().trim().min(1);
const status = z.enum(ProjectStatus);

export const projectsRouter = t.router({
  list: wsProcedure
    .input(
      z.object({
        filter: z
          .object({
            dueOn: z.date().optional(),
            dueBefore: z.date().optional(),
            dueAfter: z.date().optional(),
            status: status.optional(),
            origin: z.enum(['local', 'external']).optional(),
          })
          .optional(),
        sort: z
          .object({
            sortBy: z.enum(['dueDate', 'createdAt', 'updatedAt', 'status']),
            direction: z.enum(['asc', 'desc']).optional(),
          })
          .optional(),
        ...zPageFields,
      }),
    )
    .query(
      ({ ctx, input: { filter, sort, ...page } }): Page<Project> =>
        ctx.workspace.projects.listProjects(filter, sort, page),
    ),

  get: wsProcedure
    .input(byId)
    .query(({ ctx, input }): Project => ctx.workspace.projects.getById(input.id)),

  create: wsProcedure
    .input(
      z.object({
        title,
        description: z.string().optional(),
        startDate: z.date().optional(),
        dueDate: z.date(),
        color: hexColorSchema.optional(),
        status: status.optional(),
      }),
    )
    .mutation(({ ctx, input }): Project => ctx.workspace.projects.createProject(input)),

  // everything but the status, which goes through updateStatus so completedAt follows it
  update: wsProcedure
    .input(
      byId.extend({
        title: title.optional(),
        description: z.string().optional(),
        startDate: z.date().optional(),
        dueDate: z.date().optional(),
        color: hexColorSchema.optional(),
      }),
    )
    .mutation(
      ({ ctx, input: { id, ...updates } }): Project =>
        ctx.workspace.projects.updateProject(id, updates),
    ),

  updateStatus: wsProcedure
    .input(byId.extend({ status }))
    .mutation(
      ({ ctx, input }): Project => ctx.workspace.projects.updateStatus(input.id, input.status),
    ),

  // Deletes an archived (trashed) project for good; an active one fails with not_archived (a synced
  // project is never archived). Its tasks and notes are the user's own work and are kept, only
  // without a project (`unfiledTaskIds`, `unfiledNoteIds`), and stay in the trash with it.
  // Deleting them too is a separate delete of each.
  delete: wsProcedure
    .input(byId)
    .mutation(
      ({ ctx, input }): ProjectDeleteResult => ctx.workspace.projects.deleteProject(input.id),
    ),

  // counts of the project's active tasks by status
  stats: wsProcedure
    .input(byId)
    .query(({ ctx, input }): ProjectStats => ctx.workspace.projects.getProjectStats(input.id)),

  // the state wanted, not a toggle: a repeat changes nothing. A synced project can be favorited.
  setFavorite: wsProcedure
    .input(byId.extend({ favorite: z.boolean() }))
    .mutation(
      ({ ctx, input }): Project =>
        input.favorite
          ? ctx.workspace.favorites.favoriteProject(input.id)
          : ctx.workspace.favorites.unfavoriteProject(input.id),
    ),
});
