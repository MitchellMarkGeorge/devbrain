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

  // Whether a synced calendar syncs (a local one is refused with invalid_input). Core then syncs
  // its source, bringing the calendar's events in or removing them; that run goes on after the
  // response, and reaches the renderer as `db.changes`.
  setSelected: wsProcedure
    .input(z.object({ id: zId('calendar'), selected: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.workspace.calendars.setSelected(input.id, input.selected)),

  // Asks for synced calendars' events from `from` on, for a range before what sync keeps by
  // default; returns the calendars it changed, none when there was nothing to ask for. Core then
  // syncs their sources, which fetches the older events; that run goes on after the response, and
  // reaches the renderer as `db.changes`.
  requestHistory: wsProcedure
    .input(z.object({ from: z.date() }))
    .mutation(({ ctx, input }) => ctx.workspace.calendars.requestHistory(input.from)),
});
