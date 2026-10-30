import { z } from 'zod';
import type { RecentEntity, RecentEntityType } from '@main/core/recents/types';
import type { Page } from '@main/core/shared/pagination';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// The sidebar's Recents: what was viewed last, and recording a view.

const ENTITY_TYPES = [
  'tasks',
  'projects',
  'notes',
  'events',
] as const satisfies readonly RecentEntityType[];

export const recentsRouter = t.router({
  // the viewed entities, most recently viewed first, of one entity type or all of them
  list: wsProcedure
    .input(z.object({ entityType: z.enum([...ENTITY_TYPES, 'all']).optional(), ...zPageFields }))
    .query(
      ({ ctx, input: { entityType, ...page } }): Page<RecentEntity> =>
        ctx.workspace.recents.listRecents({ entityType }, page),
    ),
  // a task, project, note or event was opened; returns it as `list` shows it
  recordView: wsProcedure
    .input(
      z.object({
        id: z.union([zId('task'), zId('project'), zId('note'), zId('event')]),
      }),
    )
    .mutation(({ ctx, input }): RecentEntity => ctx.workspace.recents.recordView(input.id)),
});
