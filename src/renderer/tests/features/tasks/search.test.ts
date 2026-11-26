import { describe, expect, it } from 'vitest';
import { TaskPriority, TaskStatus, type AppSettings, type Project } from '@common/types';
import {
  hasFilters,
  onlyProjectOf,
  resolveTasksSearch,
  taskFilterOf,
  taskListInput,
  taskSortOf,
  tasksSearchSchema,
} from '@renderer/features/tasks/api/search';
import { groupDefs, statusesFor } from '@renderer/features/tasks/lib/groups';
import { defaultDueDate } from '@renderer/shared/lib/task-defaults';

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
        priority: ['high', 'medium'],
        project: ['prj_1', 'none'],
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
      priority: ['high', 'medium'],
      project: ['prj_1', 'none'],
      due: 'week',
      source: 'external',
      open: 'tsk_1',
    });
  });

  it('reads a filter’s one value, as older links have it, as a list of one', () => {
    expect(tasksSearchSchema.parse({ priority: 'high', project: 'prj_1' })).toEqual({
      priority: ['high'],
      project: ['prj_1'],
    });
  });

  it('drops a bad value from a list, and the filter when none is left', () => {
    expect(
      tasksSearchSchema.parse({ priority: ['urgent', 'low', 'low'], project: ['tsk_1'] }),
    ).toEqual({ priority: ['low'] });
    expect(tasksSearchSchema.parse({ priority: [] }).priority).toBeUndefined();
  });

  it('keeps due and source to one value', () => {
    expect(tasksSearchSchema.parse({ due: ['today', 'week'], source: ['local'] })).toEqual({});
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
    expect(tasksSearchSchema.parse({ project: 'none' })).toEqual({ project: ['none'] });
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
        priority: ['low'],
        project: ['prj_1' as never],
        source: 'local',
      }),
    ).toEqual({
      excludeSubtasks: true,
      status: TaskStatus.COMPLETED,
      priority: [TaskPriority.LOW],
      projectId: ['prj_1'],
      origin: 'local',
    });
    expect(filterOf({ project: ['none'] }).projectId).toEqual([null]);
    expect(filterOf({ priority: ['none'] }).priority).toEqual([TaskPriority.NONE]);
  });

  it('sends several values of a filter as a list, "no project" among them as null', () => {
    expect(
      filterOf({ priority: ['high', 'medium'], project: ['prj_1' as never, 'none'] }),
    ).toMatchObject({
      priority: [TaskPriority.HIGH, TaskPriority.MEDIUM],
      projectId: ['prj_1', null],
    });
  });

  it('files a new task in the project the page is filtered to, when it is just one', () => {
    const only = (project: string[]) =>
      onlyProjectOf(resolveTasksSearch({ project: project as never }, SETTINGS));
    expect(only(['prj_1'])).toBe('prj_1');
    expect(only(['prj_1', 'prj_2'])).toBeUndefined();
    expect(only(['none'])).toBeUndefined();
    expect(only([])).toBeUndefined();
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
    expect(hasFilters({ priority: ['high'] })).toBe(true);
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
      groupDefs(
        resolved({ group_by: 'project', project: ['prj_b' as never] }),
        TODAY,
        projects,
      ).map((def) => def.label),
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

  it('groups by priority, highest first, then synced tasks with no priority', () => {
    const defs = groupDefs(resolved({ group_by: 'priority' }), TODAY, []);
    expect(defs.map((def) => def.label)).toEqual(['High', 'Medium', 'Low', 'No priority']);
    const none = defs.find((def) => def.label === 'No priority')!;
    expect(none.filter).toEqual({ priority: TaskPriority.NONE });
    // a task added there is the user's own: it takes the default priority, never NONE
    expect(none.defaults).toEqual({});
    expect(
      groupDefs(resolved({ group_by: 'priority', priority: ['none'] }), TODAY, []).map(
        (def) => def.label,
      ),
    ).toEqual(['No priority']);
    // filtered to several: a group for each, in the groups' own order
    expect(
      groupDefs(resolved({ group_by: 'priority', priority: ['medium', 'high'] }), TODAY, []).map(
        (def) => def.label,
      ),
    ).toEqual(['High', 'Medium']);
  });
});

describe('defaultDueDate', () => {
  it('reads the setting from today', () => {
    expect(defaultDueDate('today', TODAY)).toEqual(TODAY);
    expect(defaultDueDate('tomorrow', TODAY)).toEqual(new Date(2026, 5, 23));
    // 22 Jun 2026 is a Monday: next week is a week on
    expect(defaultDueDate('nextWeek', TODAY)).toEqual(new Date(2026, 5, 29));
    expect(defaultDueDate(undefined, TODAY)).toBeNull();
  });
});
