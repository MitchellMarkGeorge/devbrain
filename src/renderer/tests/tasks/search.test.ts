import { describe, expect, it } from 'vitest';
import { TaskPriority, TaskStatus, type AppSettings, type Project } from '@common/types';
import {
  hasFilters,
  resolveTasksSearch,
  taskFilterOf,
  taskListInput,
  taskSortOf,
  tasksSearchSchema,
} from '../../pages/tasks/search';
import { groupDefs, statusesFor } from '../../pages/tasks/groups';
import { defaultDueDate } from '../../pages/tasks/CreateTaskDialog';

// The tasks page's search params: parsed per field, every bad value dropped on its own, and
// missing ones filled from the settings at render.

const SETTINGS: Pick<AppSettings, 'tasks'> = {
  tasks: {
    defaultSort: 'dueDate',
    defaultPriority: TaskPriority.MEDIUM,
    defaultDueDate: 'tomorrow',
    defaultView: 'board',
    showCompletedTasks: false,
  },
};
const TODAY = new Date(2026, 5, 22);

describe('tasksSearchSchema', () => {
  it('reads every param', () => {
    expect(
      tasksSearchSchema.parse({
        view: 'group',
        group_by: 'due',
        sort: 'updated_at',
        dir: 'asc',
        status: 'in_progress',
        priority: 'high',
        project: 'prj_1',
        due: 'week',
        source: 'external',
        open: 'tsk_1',
      }),
    ).toEqual({
      view: 'group',
      group_by: 'due',
      sort: 'updated_at',
      dir: 'asc',
      status: 'in_progress',
      priority: 'high',
      project: 'prj_1',
      due: 'week',
      source: 'external',
      open: 'tsk_1',
    });
  });

  it('drops a bad value, keeping the rest', () => {
    expect(
      tasksSearchSchema.parse({
        view: 'kanban',
        sort: 'dueDate',
        status: 'open',
        project: 'tsk_not_a_project',
        open: 'prj_not_a_task',
        priority: 3,
      }),
    ).toEqual({ status: 'open' });
    expect(tasksSearchSchema.parse({ project: 'none' })).toEqual({ project: 'none' });
  });

  it('writes nothing for a missing param', () => {
    expect(tasksSearchSchema.parse({})).toEqual({});
  });
});

describe('resolveTasksSearch', () => {
  it('fills a missing param from the settings', () => {
    const resolved = resolveTasksSearch({}, SETTINGS);
    expect(resolved).toMatchObject({
      view: 'board',
      groupBy: 'project',
      sort: 'due_date',
      dir: 'asc',
      status: 'open',
    });
    expect(
      resolveTasksSearch({}, { tasks: { ...SETTINGS.tasks, showCompletedTasks: true } }).status,
    ).toBe('all');
  });

  it('keeps what the URL says', () => {
    expect(resolveTasksSearch({ view: 'list', sort: 'priority' }, SETTINGS)).toMatchObject({
      view: 'list',
      sort: 'priority',
      dir: 'desc',
    });
  });
});

describe('the filter tasks.list gets', () => {
  const filterOf = (search: Parameters<typeof resolveTasksSearch>[0]) =>
    taskFilterOf(resolveTasksSearch(search, SETTINGS), TODAY);

  it('maps each param to core’s field', () => {
    expect(filterOf({})).toEqual({ excludeSubtasks: true, excludeClosed: true });
    expect(filterOf({ status: 'all' })).toEqual({ excludeSubtasks: true });
    expect(
      filterOf({
        status: 'completed',
        priority: 'low',
        project: 'prj_1' as never,
        source: 'local',
      }),
    ).toEqual({
      excludeSubtasks: true,
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.LOW,
      projectId: 'prj_1',
      origin: 'local',
    });
    expect(filterOf({ project: 'none' }).projectId).toBeNull();
  });

  it('maps a due bucket to dates around today', () => {
    expect(filterOf({ due: 'today' }).dueOn).toEqual(TODAY);
    expect(filterOf({ due: 'overdue' })).toMatchObject({ dueBefore: TODAY, excludeClosed: true });
    expect(filterOf({ status: 'all', due: 'week' })).toMatchObject({
      dueAfter: new Date(TODAY.getTime() - 1),
      dueBefore: new Date(2026, 5, 29),
    });
    expect(filterOf({ due: 'none' }).noDueDate).toBe(true);
  });

  it('lists subtasks in the list views, and sorts as asked', () => {
    const resolved = resolveTasksSearch({ sort: 'created_at', dir: 'asc' }, SETTINGS);
    expect(taskListInput(resolved, TODAY).filter).not.toHaveProperty('excludeSubtasks');
    expect(taskSortOf(resolved)).toEqual({ sortBy: 'createdAt', direction: 'asc' });
  });

  it('says whether a filter narrows the list', () => {
    expect(hasFilters({ view: 'list', sort: 'priority' })).toBe(false);
    expect(hasFilters({ priority: 'high' })).toBe(true);
  });
});

describe('the group view’s groups', () => {
  const resolved = (search: Parameters<typeof resolveTasksSearch>[0]) =>
    resolveTasksSearch({ view: 'group', ...search }, SETTINGS);

  it('groups by the statuses the filter lets through', () => {
    expect(statusesFor(resolved({}))).toEqual([TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS]);
    expect(statusesFor(resolved({ status: 'all' }))).toHaveLength(3);
    expect(statusesFor(resolved({ status: 'cancelled' }))).toEqual([TaskStatus.CANCELLED]);
  });

  it('groups by project, then the tasks in none', () => {
    const projects = [
      { id: 'prj_a', title: 'Auth', color: '#2b7fff' },
      { id: 'prj_b', title: 'API', color: null },
    ] as Project[];
    const defs = groupDefs(resolved({ group_by: 'project' }), TODAY, projects);
    expect(defs.map((def) => def.label)).toEqual(['Auth', 'API', 'No project']);
    expect(defs[0]).toMatchObject({
      filter: { projectId: 'prj_a' },
      defaults: { projectId: 'prj_a' },
    });
    expect(defs[2].filter).toEqual({ projectId: null });
    expect(
      groupDefs(resolved({ group_by: 'project', project: 'prj_b' as never }), TODAY, projects).map(
        (def) => def.label,
      ),
    ).toEqual(['API']);
  });

  it('groups by due date into buckets', () => {
    expect(groupDefs(resolved({ group_by: 'due' }), TODAY, []).map((def) => def.label)).toEqual([
      'Overdue',
      'Today',
      'This week',
      'Later',
      'No due date',
    ]);
  });

  it('groups by priority, highest first', () => {
    expect(
      groupDefs(resolved({ group_by: 'priority' }), TODAY, []).map((def) => def.label),
    ).toEqual(['High', 'Medium', 'Low']);
  });
});

describe('defaultDueDate', () => {
  it('reads the setting from today', () => {
    expect(defaultDueDate('today', TODAY)).toEqual(TODAY);
    expect(defaultDueDate('tomorrow', TODAY)).toEqual(new Date(2026, 5, 23));
    // 22 Jun 2026 is a Monday: next week is the Monday after
    expect(defaultDueDate('nextWeek', TODAY)).toEqual(new Date(2026, 5, 29));
    expect(defaultDueDate(undefined, TODAY)).toBeNull();
  });
});
