import { app } from 'electron';
import { publicQuery } from '../procedures';
import { t } from '../trpc';

export const appRouter = t.router({
  ping: publicQuery.query(() => 'pong'),
  version: publicQuery.query(() => app.getVersion()),
});
