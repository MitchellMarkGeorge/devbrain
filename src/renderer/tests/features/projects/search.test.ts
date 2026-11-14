import { describe, expect, it } from 'vitest';
import type { ProjectId } from '@common/ids';
import { ProjectStatus } from '@common/types';
import {
  hasProjectFilters,
  projectListInput,
  projectSearchSchema,
  projectsSearchSchema,
  projectTasksSearch,
  resolveProjectsSearch,
} from '@renderer/features/projects/api/search';

// The projects pages' search params: parsed per field, every bad value dropped on its own, and
// missing ones filled with their defaults at render.

describe('projectsSearchSchema', () => {
  it('reads every param', () => {
    expect(
      projectsSearchSchema.parse({
        view: 'card',
        status: 'on_hold',
        sort: 'updated_at',
        dir: 'asc',
        source: 'external',
      }),
    ).toEqual({
      view: 'card',
      status: 'on_hold',
      sort: 'updated_at',
      dir: 'asc',
      source: 'external',
    });
  });

  it('drops a bad value on its own, keeping the rest', () => {
    expect(projectsSearchSchema.parse({ view: 'board', status: 'all', sort: 7 })).toEqual({
      status: 'all',
    });
  });
});

describe('resolveProjectsSearch', () => {
  it('fills the defaults: list, Active, by due date soonest first', () => {
    expect(resolveProjectsSearch({})).toEqual({
      view: 'list',
      status: 'active',
      sort: 'due_date',
      dir: 'asc',
      source: undefined,
    });
  });

  it('gives each sort its own natural order', () => {
    expect(resolveProjectsSearch({ sort: 'updated_at' }).dir).toBe('desc');
    expect(resolveProjectsSearch({ sort: 'updated_at', dir: 'asc' }).dir).toBe('asc');
  });

  it('counts only a status or source in the URL as a filter', () => {
    expect(hasProjectFilters({ view: 'card', sort: 'status' })).toBe(false);
    expect(hasProjectFilters({ status: 'all' })).toBe(true);
    expect(hasProjectFilters({ source: 'local' })).toBe(true);
  });
});

describe('projectListInput', () => {
  it('maps the status filter and the sort to what projects.list takes', () => {
    expect(projectListInput(resolveProjectsSearch({}))).toEqual({
      filter: { status: ProjectStatus.ACTIVE },
      sort: { sortBy: 'dueDate', direction: 'asc' },
      limit: 100,
    });
    expect(
      projectListInput(resolveProjectsSearch({ status: 'all', source: 'local', sort: 'status' })),
    ).toEqual({
      filter: { origin: 'local' },
      sort: { sortBy: 'status', direction: 'asc' },
      limit: 100,
    });
  });
});

describe('the project page’s params', () => {
  const id = 'prj_1' as ProjectId;

  it('reads the tab and the Tasks tab’s params, without a project of its own', () => {
    expect(
      projectSearchSchema.parse({ tab: 'tasks', view: 'board', project: 'prj_2', status: 'open' }),
    ).toEqual({ tab: 'tasks', view: 'board', status: 'open' });
    expect(projectSearchSchema.parse({ tab: 'settings' })).toEqual({});
  });

  it('fixes the Tasks tab’s project, and groups by status instead of project', () => {
    expect(projectTasksSearch({ tab: 'tasks', view: 'group' }, id)).toEqual({
      view: 'group',
      group_by: 'status',
      project: id,
    });
    expect(projectTasksSearch({ group_by: 'project' }, id).group_by).toBe('status');
    expect(projectTasksSearch({ group_by: 'priority' }, id).group_by).toBe('priority');
  });
});
