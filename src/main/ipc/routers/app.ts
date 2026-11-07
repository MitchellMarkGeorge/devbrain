import { app } from 'electron';
import { z } from 'zod';
import { publicProcedure } from '../procedures';
import { t } from '../trpc';

export const appRouter = t.router({
  ping: publicProcedure.query(() => 'pong'),
  version: publicProcedure.query(() => app.getVersion()),
  // Pops up the app menu at a point in the window (CSS pixels from its top left): the Windows
  // title bar's menu button, as the page draws the title bar there and Windows shows no menu bar.
  // Resolves once the menu closes. A command it runs reports its own changes.
  showMenu: publicProcedure
    .input(z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() }))
    .mutation(({ ctx, input }) => ctx.desktop.showAppMenu(input)),
  // Shows the log file in the file manager. Public: the renderer offers it when DevBrain couldn't
  // open its data folder, the one time nothing else can run.
  showLogFile: publicProcedure.mutation(({ ctx }) => ctx.desktop.showLogFile()),
});
