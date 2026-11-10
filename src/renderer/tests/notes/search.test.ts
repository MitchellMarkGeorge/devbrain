import { describe, expect, it } from 'vitest';
import { TaskStatus } from '@common/types';
import { tasksSummary } from '../../pages/notes/queries';
import {
  hasFilters,
  noteListInput,
  notesSearchSchema,
  resolveNotesSearch,
} from '../../pages/notes/search';

// The notes page's search params: parsed per field, every bad value dropped on its own, and
// missing ones filled in at render, never written into the URL.

describe('notesSearchSchema', () => {
  it('reads every param', () => {
    const search = { view: 'card', sort: 'title', dir: 'desc', project: 'prj_1', link: 'event' };
    expect(notesSearchSchema.parse(search)).toEqual(search);
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

  it('reads `none` for the notes in no project', () => {
    expect(notesSearchSchema.parse({ project: 'none' })).toEqual({ project: 'none' });
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
      project: undefined,
      link: undefined,
    });
  });

  it('sorts titles A to Z unless the URL says otherwise', () => {
    expect(resolveNotesSearch({ sort: 'title' }).dir).toBe('asc');
    expect(resolveNotesSearch({ sort: 'title', dir: 'desc' }).dir).toBe('desc');
  });

  it('knows when a filter narrows the list', () => {
    expect(hasFilters({ view: 'card', sort: 'title' })).toBe(false);
    expect(hasFilters({ link: 'none' })).toBe(true);
    expect(hasFilters({ project: 'none' })).toBe(true);
  });
});

describe('noteListInput', () => {
  it('maps each filter to core’s', () => {
    const input = (search: Parameters<typeof resolveNotesSearch>[0]) =>
      noteListInput(resolveNotesSearch(search)).filter;
    expect(input({})).toEqual({});
    expect(input({ project: 'none' })).toEqual({ projectId: null });
    expect(input({ project: 'prj_1' as never })).toEqual({ projectId: 'prj_1' });
    expect(input({ link: 'event' })).toEqual({ linkedTo: 'event' });
    expect(input({ link: 'task' })).toEqual({ linkedTo: 'task' });
    expect(input({ link: 'none' })).toEqual({ linkedEventId: null, linkedTaskId: null });
  });

  it('maps the sort, in pages of 100', () => {
    expect(noteListInput(resolveNotesSearch({ sort: 'created_at', dir: 'asc' }))).toEqual({
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
