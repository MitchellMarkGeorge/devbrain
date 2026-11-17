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

  // Lists a synced source's calendars again from its provider, for the calendar picker, and
  // returns them: new and renamed calendars show without waiting for a sync. No events are pulled.
  // While the provider can't be asked (disabled, needs reauth, rate limited) it returns what is
  // stored; a provider failure is an error.
  refresh: wsProcedure
    .input(z.object({ sourceId: zId('externalSource') }))
    .mutation(({ ctx, input }) => ctx.workspace.calendars.refresh(input.sourceId)),

  // Whether a synced calendar syncs (a local one is refused with invalid_input). Deselecting one
  // removes its events before it answers; selecting one syncs its source, a run that goes on after
  // the response and reaches the renderer as `db.changes`.
  setSelected: wsProcedure
    .input(z.object({ id: zId('calendar'), selected: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.workspace.calendars.setSelected(input.id, input.selected)),
});
