import { z } from 'zod';
import type { Workspace } from '@main/core';
import { toDateString } from '@main/core/shared/dates';
import { WorkspaceClosedError } from '@main/core/shared/errors';
import { NOTE_EXTENSIONS } from '@main/core/transfer/service';
import type {
  NoteExportResult,
  NoteImportSummary,
  TaskExportResult,
  TaskImportSummary,
} from '@main/core/transfer/types';
import type { AppContext } from '../context';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';

// Importing and exporting the open workspace's tasks and notes (docs/import-export.md). Main asks
// for the file or folder with the system dialog, then hands its path to core's TransferService:
// the renderer never names a path. Each resolves with null when the dialog is cancelled. What an
// import creates is announced by TaskService and NoteService, so it comes back in `changed`.

// The workspace the call started on, once the dialog has closed: one switched or closed meanwhile
// (from another window) gets nothing written to it, and the call fails with workspace_closed.
function stillOpen(ctx: Pick<AppContext, 'devBrain'>, workspace: Workspace): Workspace {
  if (ctx.devBrain?.currentWorkspace !== workspace) throw new WorkspaceClosedError();
  return workspace;
}

const taskFormat = z.enum(['csv', 'json']);

export const transferRouter = t.router({
  // a CSV or JSON file of tasks; the summary lists what was created, skipped and refused, by row
  importTasks: wsProcedure.mutation(async ({ ctx }): Promise<TaskImportSummary | null> => {
    const files = await ctx.desktop.chooseFiles({
      title: 'Import tasks',
      filters: [{ name: 'Tasks (CSV or JSON)', extensions: ['csv', 'json'] }],
    });
    if (files === null) return null;
    return stillOpen(ctx, ctx.workspace).transfer.importTasksFromFile(files[0]);
  }),

  // Markdown files, one note each
  importNotes: wsProcedure.mutation(async ({ ctx }): Promise<NoteImportSummary | null> => {
    const files = await ctx.desktop.chooseFiles({
      title: 'Import notes',
      filters: [{ name: 'Markdown', extensions: NOTE_EXTENSIONS }],
      multiple: true,
    });
    if (files === null) return null;
    return stillOpen(ctx, ctx.workspace).transfer.importNotesFromFiles(files);
  }),

  // every active task, to a file the user names
  exportTasks: wsProcedure
    .input(z.object({ format: taskFormat }))
    .mutation(async ({ ctx, input }): Promise<TaskExportResult | null> => {
      const filePath = await ctx.desktop.chooseSaveFile({
        title: 'Export tasks',
        defaultName: `DevBrain tasks ${toDateString(new Date())}.${input.format}`,
        filters: [{ name: input.format.toUpperCase(), extensions: [input.format] }],
      });
      if (filePath === null) return null;
      return stillOpen(ctx, ctx.workspace).transfer.exportTasksToFile(filePath, input.format);
    }),

  // every active note, as .md files in a new folder inside the one the user picks
  exportNotes: wsProcedure.mutation(async ({ ctx }): Promise<NoteExportResult | null> => {
    const dir = await ctx.desktop.chooseFolder({
      title: 'Export notes',
      buttonLabel: 'Export here',
    });
    if (dir === null) return null;
    return stillOpen(ctx, ctx.workspace).transfer.exportNotesToFolder(dir);
  }),
});
