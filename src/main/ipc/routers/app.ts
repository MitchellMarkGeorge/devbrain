import { app } from 'electron';
import { publicProcedure } from '../procedures';
import { t } from '../trpc';

export const appRouter = t.router({
  ping: publicProcedure.query(() => 'pong'),
  version: publicProcedure.query(() => app.getVersion()),
});
