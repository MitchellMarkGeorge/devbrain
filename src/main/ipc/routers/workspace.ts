import { z } from 'zod';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';

// What the open workspace does that belongs to no feature router.
export const workspaceRouter = t.router({
  // Opens a link in the system browser. Only http and https URLs are opened: core's
  // guardOpenExternal throws UnsafeUrlError (unsafe_url) for anything else, having opened nothing
  // (docs/security/untrusted-content.md)
  openUrl: wsProcedure
    .input(z.object({ url: z.string() }))
    .mutation(({ ctx, input }) => ctx.workspace.openUrl(input.url)),

  // Shows the open workspace's folder (its database and note files) in the file manager. The path
  // is the workspace's own, never input
  showInFolder: wsProcedure.mutation(({ ctx }) => ctx.desktop.openFolder(ctx.workspace.info.path)),
});
