import { z } from 'zod';
import { DateTime } from 'luxon';
import { isId, type ProjectId, type TaskId } from '@common/ids';
import { NOTE_LINK_KINDS } from '@common/types';
import type { ipc } from '@renderer/ipc';
import { multiParam } from '@renderer/shared/lib/search-params';

// The notes page's search params (docs/renderer/implementation-plan.md, "Search params ›
// /app/notes"): snake case names and values, each `.optional().catch(undefined)`, so a bad value
// drops that one field back to its default rather than failing the page. No default is ever
// written into the URL: a missing param is resolved at render (`resolveNotesSearch`).
//
// The project filter holds several values, "any of these" (`multiParam`): a list in the URL, or
// one value alone, as links from before it could hold several have it. `link` is the page's Type,
// one value: a note is one type.

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const projectId = z.custom<ProjectId>((value) => isId('project', value), 'Not a project id');

export const NOTE_VIEWS = ['list', 'card'] as const;
export const NOTE_SORTS = ['updated_at', 'created_at', 'title'] as const;
export const LINK_FILTERS = NOTE_LINK_KINDS;
// when a note was last edited: today, in the past 7 or 30 days (today among them), or before those
export const EDITED_FILTERS = ['today', 'week', 'month', 'older'] as const;
// whether tasks were made from the note
export const TASKS_FILTERS = ['with', 'without'] as const;

export const notesSearchSchema = z.object({
  view: optional(z.enum(NOTE_VIEWS)),
  /** "Last edited" by default */
  sort: optional(z.enum(NOTE_SORTS)),
  dir: optional(z.enum(['asc', 'desc'])),
  /** the notes of any of these projects, `none` being the notes in no project */
  project: multiParam(z.union([projectId, z.literal('none')])),
  /** the page's Type: the notes linked to an event, to a task, or to neither; all when missing */
  link: optional(z.enum(LINK_FILTERS)),
  edited: optional(z.enum(EDITED_FILTERS)),
  /** the notes tasks were made from, or the ones none were */
  tasks: optional(z.enum(TASKS_FILTERS)),
});

export type NotesSearch = z.infer<typeof notesSearchSchema>;

const taskId = z.custom<TaskId>((value) => isId('task', value), 'Not a task id');

/** The note page's search params: the task made from the note that is open in the sheet. */
export const notePageSearchSchema = z.object({ open: optional(taskId) });

export type NotePageSearch = z.infer<typeof notePageSearchSchema>;
export type NoteView = (typeof NOTE_VIEWS)[number];
export type NoteSortParam = (typeof NOTE_SORTS)[number];
export type LinkFilter = (typeof LINK_FILTERS)[number];
export type EditedFilter = (typeof EDITED_FILTERS)[number];
export type TasksFilter = (typeof TASKS_FILTERS)[number];

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

/**
 * The page's state, every missing param filled in. The project filter is a list, empty when it is
 * not set; `link` is undefined for notes of every type.
 */
export interface ResolvedNotesSearch {
  view: NoteView;
  sort: NoteSortParam;
  dir: 'asc' | 'desc';
  project: readonly (ProjectId | 'none')[];
  link: LinkFilter | undefined;
  edited: EditedFilter | undefined;
  tasks: TasksFilter | undefined;
}

export function resolveNotesSearch(search: NotesSearch): ResolvedNotesSearch {
  const sort = search.sort ?? 'updated_at';
  return {
    view: search.view ?? 'list',
    sort,
    dir: search.dir ?? DEFAULT_DIRECTION[sort],
    project: search.project ?? [],
    link: search.link,
    edited: search.edited,
    tasks: search.tasks,
  };
}

/** Whether a filter narrows the list (the "no results" state offers to clear them). */
export function hasFilters(search: NotesSearch): boolean {
  return (
    search.project !== undefined ||
    search.link !== undefined ||
    search.edited !== undefined ||
    search.tasks !== undefined
  );
}

/** The change that removes every filter, the view and sort kept: "Clear filters". */
export const CLEAR_FILTERS: Partial<NotesSearch> = {
  project: undefined,
  link: undefined,
  edited: undefined,
  tasks: undefined,
};

/** How many notes a page of `notes.list` asks for. */
export const NOTES_PAGE_SIZE = 100;

/**
 * The `editedFrom`/`editedBefore` filter for an edited bucket, on the day `today` falls in (local
 * time). The past 7 days are today and the six days before it, the past 30 likewise; older is
 * everything before those 30.
 */
export function editedFilter(edited: EditedFilter, today: Date): NoteFilter {
  const start = DateTime.fromJSDate(today).startOf('day');
  switch (edited) {
    case 'today':
      return { editedFrom: start.toJSDate() };
    case 'week':
      return { editedFrom: start.minus({ days: 6 }).toJSDate() };
    case 'month':
      return { editedFrom: start.minus({ days: 29 }).toJSDate() };
    case 'older':
      return { editedBefore: start.minus({ days: 29 }).toJSDate() };
  }
}

/** The page's `notes.list` input, without the cursor; `today` is the day the Edited filter is on. */
export function noteListInput(resolved: ResolvedNotesSearch, today: Date): NoteListInput {
  const filter: NoteFilter = {};
  if (resolved.project.length > 0) {
    filter.projectId = resolved.project.map((project) => (project === 'none' ? null : project));
  }
  if (resolved.link) filter.linkedTo = resolved.link;
  if (resolved.edited) Object.assign(filter, editedFilter(resolved.edited, today));
  if (resolved.tasks) filter.hasTasks = resolved.tasks === 'with';
  return {
    filter,
    sort: { sortBy: SORT_BY[resolved.sort], direction: resolved.dir },
    limit: NOTES_PAGE_SIZE,
  };
}
