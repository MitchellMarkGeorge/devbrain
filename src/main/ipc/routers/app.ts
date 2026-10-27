import { app } from 'electron';
import { t } from '../init';

export const appRouter = t.router({
  ping: t.procedure.query(() => 'pong'),
  version: t.procedure.query(() => app.getVersion()),
});
