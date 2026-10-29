import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId } from '../zod';

// The calendars events belong to, local and synced.

export const calendarsRouter = t.router({
  list: wsProcedure.query(({ ctx }) => ctx.workspace.calendars.list()),

  // shows or hides a calendar's events in the calendar view
  setVisible: wsProcedure
    .input(z.object({ id: zId('calendar'), visible: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.workspace.calendars.setVisible(input.id, input.visible)),

  // Whether a synced calendar syncs (a local one is refused with invalid_input). Its source then
  // syncs at once, bringing the calendar's events in or removing them; that run is left going
  // after the response, and reaches the renderer as `db.changes`.
  setSelected: wsProcedure
    .input(z.object({ id: zId('calendar'), selected: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const calendar = ctx.workspace.calendars.setSelected(input.id, input.selected);
      // never rejects: how the run ended is recorded on its source
      if (calendar.sourceId !== null) void ctx.workspace.sync.syncNow(calendar.sourceId);
      return calendar;
    }),
});
