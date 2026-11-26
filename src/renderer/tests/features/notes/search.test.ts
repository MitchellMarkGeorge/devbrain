import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import { tasksSummary } from '@renderer/features/notes/api/queries';
import {
  hasFilters,
  noteListInput,
  notesSearchSchema,
  resolveNotesSearch,
} from '@renderer/features/notes/api/search';

// The notes page's search params: parsed per field, every bad value dropped on its own, and
// missing ones filled in at render, never written into the URL.

describe('notesSearchSchema', () => {
  it('reads every param', () => {
    const search = {
      view: 'card',
      sort: 'title',
      dir: 'desc',
      project: ['prj_1', 'none'],
      link: 'event',
    };
    expect(notesSearchSchema.parse(search)).toEqual(search);
  });

  it('reads the project’s one value, as older links have it, as a list of one', () => {
    expect(notesSearchSchema.parse({ project: 'prj_1', link: 'event' })).toEqual({
      project: ['prj_1'],
      link: 'event',
    });
  });

  it('drops a bad value from a list, and the filter when none is left', () => {
    expect(notesSearchSchema.parse({ project: ['tsk_1', 'prj_1', 'prj_1'] })).toEqual({
      project: ['prj_1'],
    });
    expect(notesSearchSchema.parse({ project: [] }).project).toBeUndefined();
  });

  it('reads one type: a list of them, or an unknown one, is every type', () => {
    expect(notesSearchSchema.parse({ link: 'none' }).link).toBe('none');
    expect(notesSearchSchema.parse({ link: ['event', 'task'] }).link).toBeUndefined();
    expect(notesSearchSchema.parse({ link: 'meeting' }).link).toBeUndefined();
  });

  it('drops a bad value, keeping the rest', () => {
    expect(
      notesSearchSchema.parse({
        view: 'board',
        sort: 'updatedAt',
        dir: 'up',
        project: 'tsk_1',
        link: 'task',
      }),
    ).toEqual({ link: 'task' });
  });

  it('reads Edited and Has tasks, one value each', () => {
    expect(notesSearchSchema.parse({ edited: 'month', tasks: 'with' })).toEqual({
      edited: 'month',
      tasks: 'with',
    });
    expect(notesSearchSchema.parse({ edited: 'yesterday', tasks: 'yes' })).toEqual({});
  });

  it('reads `none` for the notes in no project', () => {
    expect(notesSearchSchema.parse({ project: 'none' })).toEqual({ project: ['none'] });
  });

  it('writes nothing for a missing param', () => {
    expect(notesSearchSchema.parse({})).toEqual({});
  });
});

describe('resolveNotesSearch', () => {
  it('fills the defaults: the list, last edited first', () => {
    expect(resolveNotesSearch({})).toEqual({
      view: 'list',
      sort: 'updated_at',
      dir: 'desc',
      project: [],
      link: undefined,
      edited: undefined,
      tasks: undefined,
    });
  });

  it('sorts titles A to Z unless the URL says otherwise', () => {
    expect(resolveNotesSearch({ sort: 'title' }).dir).toBe('asc');
    expect(resolveNotesSearch({ sort: 'title', dir: 'desc' }).dir).toBe('desc');
  });

  it('knows when a filter narrows the list', () => {
    expect(hasFilters({ view: 'card', sort: 'title' })).toBe(false);
    expect(hasFilters({ link: 'none' })).toBe(true);
    expect(hasFilters({ project: ['none'] })).toBe(true);
    expect(hasFilters({ edited: 'week' })).toBe(true);
    expect(hasFilters({ tasks: 'without' })).toBe(true);
  });
});

// the day the Edited filter is on, part way through it
const TODAY = new Date(2026, 5, 22, 15, 30);

describe('noteListInput', () => {
  it('maps Edited to the days it covers, today among them, and Has tasks to core’s flag', () => {
    const input = (search: Parameters<typeof resolveNotesSearch>[0]) =>
      noteListInput(resolveNotesSearch(search), TODAY).filter;
    expect(input({ edited: 'today' })).toEqual({ editedFrom: new Date(2026, 5, 22) });
    expect(input({ edited: 'week' })).toEqual({ editedFrom: new Date(2026, 5, 16) });
    expect(input({ edited: 'month' })).toEqual({ editedFrom: new Date(2026, 4, 24) });
    expect(input({ edited: 'older' })).toEqual({ editedBefore: new Date(2026, 4, 24) });
    expect(input({ tasks: 'with' })).toEqual({ hasTasks: true });
    expect(input({ tasks: 'without' })).toEqual({ hasTasks: false });
  });

  it('maps each filter to core’s', () => {
    const input = (search: Parameters<typeof resolveNotesSearch>[0]) =>
      noteListInput(resolveNotesSearch(search), TODAY).filter;
    expect(input({})).toEqual({});
    expect(input({ project: ['none'] })).toEqual({ projectId: [null] });
    expect(input({ project: ['prj_1' as never] })).toEqual({ projectId: ['prj_1'] });
    expect(input({ link: 'event' })).toEqual({ linkedTo: 'event' });
    expect(input({ link: 'none' })).toEqual({ linkedTo: 'none' });
  });

  it('sends several projects as a list, "no project" among them as null, beside the one type', () => {
    const input = (search: Parameters<typeof resolveNotesSearch>[0]) =>
      noteListInput(resolveNotesSearch(search), TODAY).filter;
    expect(input({ project: ['prj_1' as never, 'none'], link: 'task' })).toEqual({
      projectId: ['prj_1', null],
      linkedTo: 'task',
    });
  });

  it('maps the sort, in pages of 100', () => {
    expect(noteListInput(resolveNotesSearch({ sort: 'created_at', dir: 'asc' }), TODAY)).toEqual({
      filter: {},
      sort: { sortBy: 'createdAt', direction: 'asc' },
      limit: 100,
    });
  });
});

describe('tasksSummary', () => {
  it('counts the tasks and those in progress', () => {
    expect(tasksSummary([])).toBeUndefined();
    expect(tasksSummary([TaskStatus.NOT_STARTED])).toBe('1 task');
    expect(
      tasksSummary([TaskStatus.IN_PROGRESS, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]),
    ).toBe('3 tasks · 2 in progress');
  });
});
