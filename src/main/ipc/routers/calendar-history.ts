import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// Fetches history before the normal Google Calendar sync window. The renderer calls this when a
// visible range moves earlier; already-covered ranges make no provider request.
export const calendarHistoryRouter = t.router({
  ensureRange: wsProcedure
    .input(
      z.object({
        start: z.date(),
        calendarIds: z.array(zId('calendar')).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.workspace.calendarHistory.ensureRange(input.start, input.calendarIds),
    ),
});
