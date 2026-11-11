import { z } from 'zod';
import { isId, type ProjectId, type TaskId } from '@common/ids';
import type { ipc } from '../../ipc';

// The notes page's search params (docs/renderer/implementation-plan.md, "Search params ›
// /app/notes"): snake case names and values, each `.optional().catch(undefined)`, so a bad value
// drops that one field back to its default rather than failing the page. No default is ever
// written into the URL: a missing param is resolved at render (`resolveNotesSearch`).

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const projectId = z.custom<ProjectId>((value) => isId('project', value), 'Not a project id');

export const NOTE_VIEWS = ['list', 'card'] as const;
export const NOTE_SORTS = ['updated_at', 'created_at', 'title'] as const;
export const LINK_FILTERS = ['event', 'task', 'none'] as const;

export const notesSearchSchema = z.object({
  view: optional(z.enum(NOTE_VIEWS)),
  /** "Last edited" by default */
  sort: optional(z.enum(NOTE_SORTS)),
  dir: optional(z.enum(['asc', 'desc'])),
  /** a project's notes, or `none` for the notes in no project */
  project: optional(z.union([projectId, z.literal('none')])),
  /** the notes linked to an event, to a task, or to neither */
  link: optional(z.enum(LINK_FILTERS)),
});

export type NotesSearch = z.infer<typeof notesSearchSchema>;

const taskId = z.custom<TaskId>((value) => isId('task', value), 'Not a task id');

/** The note page's search params: the task made from the note that is open in the sheet. */
export const notePageSearchSchema = z.object({ open: optional(taskId) });

export type NotePageSearch = z.infer<typeof notePageSearchSchema>;
export type NoteView = (typeof NOTE_VIEWS)[number];
export type NoteSortParam = (typeof NOTE_SORTS)[number];
export type LinkFilter = (typeof LINK_FILTERS)[number];

/** What `notes.list` takes. */
export type NoteListInput = NonNullable<Parameters<typeof ipc.notes.list.query>[0]>;
type NoteFilter = NonNullable<NoteListInput['filter']>;
type NoteSort = NonNullable<NoteListInput['sort']>;

const SORT_BY: Record<NoteSortParam, NoteSort['sortBy']> = {
  updated_at: 'updatedAt',
  created_at: 'createdAt',
  title: 'title',
};

// the newest first for times, A to Z for titles
const DEFAULT_DIRECTION: Record<NoteSortParam, 'asc' | 'desc'> = {
  updated_at: 'desc',
  created_at: 'desc',
  title: 'asc',
};

/** The page's state, every missing param filled in. */
export interface ResolvedNotesSearch {
  view: NoteView;
  sort: NoteSortParam;
  dir: 'asc' | 'desc';
  project: ProjectId | 'none' | undefined;
  link: LinkFilter | undefined;
}

export function resolveNotesSearch(search: NotesSearch): ResolvedNotesSearch {
  const sort = search.sort ?? 'updated_at';
  return {
    view: search.view ?? 'list',
    sort,
    dir: search.dir ?? DEFAULT_DIRECTION[sort],
    project: search.project,
    link: search.link,
  };
}

/** Whether a filter narrows the list (the "no results" state offers to clear them). */
export function hasFilters(search: NotesSearch): boolean {
  return search.project !== undefined || search.link !== undefined;
}

/** The change that removes every filter, the view and sort kept: "Clear filters". */
export const CLEAR_FILTERS: Partial<NotesSearch> = { project: undefined, link: undefined };

/** How many notes a page of `notes.list` asks for. */
export const NOTES_PAGE_SIZE = 100;

/** The page's `notes.list` input, without the cursor. */
export function noteListInput(resolved: ResolvedNotesSearch): NoteListInput {
  const filter: NoteFilter = {};
  if (resolved.project) filter.projectId = resolved.project === 'none' ? null : resolved.project;
  if (resolved.link === 'none') Object.assign(filter, { linkedEventId: null, linkedTaskId: null });
  else if (resolved.link) filter.linkedTo = resolved.link;
  return {
    filter,
    sort: { sortBy: SORT_BY[resolved.sort], direction: resolved.dir },
    limit: NOTES_PAGE_SIZE,
  };
}
