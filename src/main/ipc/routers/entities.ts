import { z } from 'zod';
import type { EntitySummary } from '@common/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// Entities of any type by id, for the editor's entity pills (src/renderer/editor).

/** the most ids one call takes; the renderer asks in batches of at most this many */
export const MAX_SUMMARY_IDS = 500;

export const entitiesRouter = t.router({
  // the summaries of these tasks, projects, notes and events, as pills draw them; one that is
  // gone or archived is left out
  summaries: wsProcedure
    .input(
      z.object({
        ids: z
          .array(z.union([zId('task'), zId('project'), zId('note'), zId('event')]))
          .max(MAX_SUMMARY_IDS),
      }),
    )
    .query(({ ctx, input }): EntitySummary[] => ctx.workspace.entities.summaries(input.ids)),
});
