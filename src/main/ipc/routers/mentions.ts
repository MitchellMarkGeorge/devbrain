import { z } from 'zod';
import type { Mention } from '@common/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// What mentions a task, project, note or event: the items whose text links to it (core/mentions).

const zTargetInput = z.object({
  targetId: z.union([zId('task'), zId('project'), zId('note'), zId('event')]),
});

export const mentionsRouter = t.router({
  // the items that mention it, most recently changed first; trashed ones left out
  list: wsProcedure
    .input(zTargetInput)
    .query(({ ctx, input }): Mention[] => ctx.workspace.mentions.list(input.targetId)),
});
