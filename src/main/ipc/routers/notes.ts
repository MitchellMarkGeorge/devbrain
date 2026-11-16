import { z } from 'zod';
import type { Note, NoteDeleteResult, NoteListItem, Page } from '@common/types';
import { wsProcedure } from '../procedures';
import { t } from '../trpc';
import { zId, zPageFields } from '../zod';

// The workspace's active notes. A note's markdown lives in its file: `updateContent` writes it, and
// the rows returned carry its preview only.

const byId = z.object({ id: zId('note') });

// null clears a link, or lists the notes without one
const links = {
  projectId: zId('project').nullable().optional(),
  linkedEventId: zId('event').nullable().optional(),
  linkedTaskId: zId('task').nullable().optional(),
};

const createNoteInput = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  ...links,
});

export const notesRouter = t.router({
  list: wsProcedure
    .input(
      z.object({
        // `linkedTo`: the notes linked to any event, or to any task
        filter: z.object({ ...links, linkedTo: z.enum(['event', 'task']).optional() }).optional(),
        sort: z
          .object({
            sortBy: z.enum(['createdAt', 'updatedAt', 'title']),
            direction: z.enum(['asc', 'desc']).optional(),
          })
          .optional(),
        ...zPageFields,
      }),
    )
    .query(
      ({ ctx, input: { filter, sort, ...page } }): Page<NoteListItem> =>
        ctx.workspace.notes.listNotes(filter, sort, page),
    ),

  get: wsProcedure
    .input(byId)
    .query(({ ctx, input }): Note => ctx.workspace.notes.getById(input.id)),

  // writes the note's file, with `content` or empty, then its row
  create: wsProcedure
    .input(createNoteInput)
    .mutation(({ ctx, input }): Promise<Note> => ctx.workspace.notes.createNote(input)),

  // the title and links; the content goes through updateContent
  update: wsProcedure
    .input(byId.extend({ title: z.string().optional(), ...links }))
    .mutation(
      ({ ctx, input: { id, ...updates } }): Note => ctx.workspace.notes.updateNote(id, updates),
    ),

  // the note's markdown, read from its file; fails with not_found, or malformed_note_file when the
  // file can't be parsed
  readContent: wsProcedure
    .input(byId)
    .query(({ ctx, input }): Promise<string> => ctx.workspace.notes.readContent(input.id)),

  // replaces the note's markdown; core runs one note's saves one at a time, so the last call wins
  updateContent: wsProcedure
    .input(byId.extend({ content: z.string() }))
    .mutation(
      ({ ctx, input }): Promise<Note> =>
        ctx.workspace.notes.updateNoteContent(input.id, input.content),
    ),

  // copies the note and its markdown file ("Copy of …"), keeping its project; the copy links to no
  // event or task, which each have one note. Returns the copy
  duplicate: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }): Promise<Note> => ctx.workspace.notes.duplicateNote(input.id)),

  // the note's title and content as Markdown, for the clipboard
  toMarkdown: wsProcedure
    .input(byId)
    .query(({ ctx, input }): Promise<string> => ctx.workspace.notes.toMarkdown(input.id)),

  // Shows the note's markdown file in the file manager, selected in the notes folder (Finder's
  // "Show in Finder"), or opens the folder when the file is missing. The path comes from core,
  // never from the input; an unknown or trashed note fails with not_found.
  showInFolder: wsProcedure
    .input(byId)
    .mutation(({ ctx, input }) => ctx.desktop.showItem(ctx.workspace.notes.filePathOf(input.id))),

  // Deletes an archived (trashed) note for good; an active one fails with not_archived. Its row
  // goes, then its file, after any save already in flight. Tasks linked to it are kept: the task
  // it was the task note of (`linkedTaskId`) has none now, and tasks made from it lose the link
  // (`unlinkedTaskIds`). If the file can't be removed the note is still deleted and `fileRemoved`
  // is false.
  delete: wsProcedure
    .input(byId)
    .mutation(
      ({ ctx, input }): Promise<NoteDeleteResult> => ctx.workspace.notes.deleteNote(input.id),
    ),

  // the state wanted, not a toggle: a repeat changes nothing
  setFavorite: wsProcedure
    .input(byId.extend({ favorite: z.boolean() }))
    .mutation(
      ({ ctx, input }): Note =>
        input.favorite
          ? ctx.workspace.favorites.favoriteNote(input.id)
          : ctx.workspace.favorites.unfavoriteNote(input.id),
    ),
});
