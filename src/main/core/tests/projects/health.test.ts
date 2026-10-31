import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { generateId, ProjectId } from '@common/ids';
import {
  computeProjectHealth,
  daysBetween,
  formatHealthReason,
  healthFromLinear,
  projectHealthCounts,
  ProjectHealthCounts,
  ProjectHealthInput,
} from '../../projects/health';
import { ProjectHealth, ProjectStatus } from '../../projects/types';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { ArchiveService } from '../../archive/service';
import { createDb } from '../utils';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';

// PROPOSAL tests for src/main/core/projects/health.ts (docs/projects/health.md)

// local days, so the tests mean the same in every time zone
const day = (month: number, date: number, hour = 0) => new Date(2026, month - 1, date, hour);
// 3pm on Jun 20
const NOW = day(6, 20, 15);

const counts = (overrides: Partial<ProjectHealthCounts> = {}): ProjectHealthCounts => ({
  total: 10,
  completed: 5,
  cancelled: 0,
  overdue: 0,
  overdueHigh: 0,
  openWithDueDate: 5,
  ...overrides,
});

// started Jun 1, due Jul 1: 30 days, 19 gone on Jun 20 (63%)
const project = (overrides: Partial<ProjectHealthInput> = {}): ProjectHealthInput => ({
  status: ProjectStatus.ACTIVE,
  startDate: day(6, 1),
  dueDate: day(7, 1),
  createdAt: day(5, 20, 9),
  completedAt: null,
  counts: counts(),
  ...overrides,
});

const health = (input: ProjectHealthInput, now = NOW) => computeProjectHealth(input, now);
const text = (input: ProjectHealthInput, now = NOW) =>
  formatHealthReason(computeProjectHealth(input, now).reason, now);

describe('daysBetween', () => {
  it('counts local days, whatever the time of day', () => {
    expect(daysBetween(day(6, 1, 23), day(6, 2, 1))).toBe(1);
    expect(daysBetween(day(6, 2, 1), day(6, 1, 23))).toBe(-1);
    expect(daysBetween(day(6, 1), day(6, 1, 23))).toBe(0);
  });

  it('is a whole number across a DST change', () => {
    expect(daysBetween(day(3, 1), day(4, 1))).toBe(31);
    expect(daysBetween(day(10, 20), day(11, 20))).toBe(31);
  });
});

describe('computeProjectHealth — schedule', () => {
  it('is on track when done keeps pace with time gone', () => {
    const result = health(project({ counts: counts({ completed: 6 }) }));
    expect(result.health).toBe(ProjectHealth.ON_TRACK);
    expect(result.reason).toMatchObject({ code: 'on_pace' });
    expect(text(project({ counts: counts({ completed: 6 }) }))).toBe(
      '60% done with 63% of the time gone',
    );
  });

  it('is at risk when behind by more than 20 points', () => {
    // 40% done, 63% gone: 23 points behind
    const input = project({ counts: counts({ completed: 4 }) });
    expect(health(input).health).toBe(ProjectHealth.AT_RISK);
    expect(text(input)).toBe('40% done with 63% of the time gone');
  });

  it('is off track when behind by more than 40 points', () => {
    // 20% done, 63% gone
    const input = project({ counts: counts({ completed: 2 }) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
    expect(health(input).reason).toMatchObject({ code: 'behind_schedule' });
  });

  it('gives a new project a grace period before judging the schedule', () => {
    // 3 of 30 days gone, nothing done
    const input = project({ counts: counts({ completed: 0 }) });
    expect(health(input, day(6, 4)).health).toBe(ProjectHealth.ON_TRACK);
    // 7 of 30 days gone (23%), nothing done
    expect(health(input, day(6, 8)).health).toBe(ProjectHealth.AT_RISK);
  });

  it('falls back to createdAt when there is no start date', () => {
    // created May 20: 31 of 42 days gone (74%), 50% done
    const input = project({ startDate: null });
    const result = health(input);
    expect(result.health).toBe(ProjectHealth.AT_RISK);
    expect(result.reason).toMatchObject({ elapsed: 31 / 42 });
  });

  it('judges a project due today with all of the time gone', () => {
    const input = project({ dueDate: day(6, 20) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
    expect(text(input)).toBe('50% done with 100% of the time gone');
  });

  it('is on track on the due day when everything is done', () => {
    const input = project({ dueDate: day(6, 20), counts: counts({ completed: 10 }) });
    expect(health(input).health).toBe(ProjectHealth.ON_TRACK);
  });

  it('treats a start on or after the due date as a one-day schedule', () => {
    const input = project({ startDate: day(6, 20), dueDate: day(6, 20) });
    expect(health(input).reason).toMatchObject({ elapsed: 0 });
  });

  it('ignores ProjectStatus.NOT_STARTED, the default most projects keep', () => {
    const input = project({ status: ProjectStatus.NOT_STARTED, counts: counts({ completed: 2 }) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
  });
});

describe('computeProjectHealth — overdue tasks', () => {
  it('is at risk with one or two overdue tasks', () => {
    const input = project({ counts: counts({ completed: 7, overdue: 2 }) });
    const result = health(input);
    expect(result.health).toBe(ProjectHealth.AT_RISK);
    expect(text(input)).toBe('2 overdue tasks');
    // the schedule is still reported, as a secondary reason
    expect(result.also).toEqual([{ code: 'on_pace', done: 0.7, elapsed: 19 / 30 }]);
  });

  it('is off track with three overdue tasks', () => {
    const input = project({ counts: counts({ completed: 7, overdue: 3 }) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
  });

  it('is off track with two overdue high priority tasks', () => {
    const input = project({ counts: counts({ completed: 7, overdue: 2, overdueHigh: 2 }) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
    expect(text(input)).toBe('2 overdue tasks, 2 high priority');
  });

  it('keeps one overdue high priority task at risk', () => {
    const input = project({ counts: counts({ completed: 7, overdue: 1, overdueHigh: 1 }) });
    expect(health(input).health).toBe(ProjectHealth.AT_RISK);
    expect(text(input)).toBe('1 overdue task, 1 high priority');
  });

  it('leads with the worse signal', () => {
    // schedule off track (20% done), one overdue task at risk
    const input = project({ counts: counts({ completed: 2, overdue: 1 }) });
    const result = health(input);
    expect(result.health).toBe(ProjectHealth.OFF_TRACK);
    expect(result.reason.code).toBe('behind_schedule');
    expect(result.also.map((reason) => reason.code)).toEqual(['overdue_tasks']);
  });

  it('leads with the overdue tasks on a tie', () => {
    const input = project({ counts: counts({ completed: 4, overdue: 1 }) });
    expect(health(input).reason.code).toBe('overdue_tasks');
  });
});

describe('computeProjectHealth — edge cases', () => {
  it('is completed for a completed project, with how late it was', () => {
    const onTime = project({ status: ProjectStatus.COMPLETED, completedAt: day(6, 18, 10) });
    expect(health(onTime).health).toBe(ProjectHealth.COMPLETED);
    expect(text(onTime)).toBe('Completed Jun 18');
    const late = project({ status: ProjectStatus.COMPLETED, completedAt: day(7, 4, 10) });
    expect(text(late, day(7, 10))).toBe('Completed 3 days late');
  });

  it('has no update while on hold, even past due', () => {
    const input = project({ status: ProjectStatus.ON_HOLD, dueDate: day(6, 10) });
    expect(health(input).health).toBe(ProjectHealth.NOT_STARTED);
    expect(text(input)).toBe('On hold');
  });

  it('is off track once the due date has passed', () => {
    const input = project({ dueDate: day(6, 15), counts: counts({ completed: 9 }) });
    expect(health(input).health).toBe(ProjectHealth.OFF_TRACK);
    expect(text(input)).toBe('Due date passed 5 days ago');
  });

  it('is off track past due even with no tasks', () => {
    const input = project({ dueDate: day(6, 19), counts: counts({ total: 0, completed: 0 }) });
    expect(text(input)).toBe('Due date passed 1 day ago');
  });

  it('has no update with no tasks', () => {
    const input = project({ counts: counts({ total: 0, completed: 0, openWithDueDate: 0 }) });
    expect(health(input).health).toBe(ProjectHealth.NOT_STARTED);
    expect(text(input)).toBe('No tasks yet');
  });

  it('has no update when every task is cancelled', () => {
    const input = project({ counts: counts({ total: 0, completed: 0, cancelled: 4 }) });
    expect(health(input).health).toBe(ProjectHealth.NOT_STARTED);
    expect(text(input)).toBe('All tasks cancelled');
  });

  it('leaves cancelled tasks out of the share done', () => {
    // 5 of 6 done once the 4 cancelled are left out
    const input = project({ counts: counts({ total: 6, completed: 5, cancelled: 4 }) });
    expect(health(input).reason).toMatchObject({ code: 'on_pace', done: 5 / 6 });
  });

  it('has no update before the start date', () => {
    const input = project({ startDate: day(7, 1), dueDate: day(8, 1) });
    expect(health(input).health).toBe(ProjectHealth.NOT_STARTED);
    expect(text(input)).toBe('Starts Jul 1');
  });

  it('still counts overdue tasks before the start date', () => {
    const input = project({
      startDate: day(7, 1),
      dueDate: day(8, 1),
      counts: counts({ overdue: 1 }),
    });
    expect(health(input).health).toBe(ProjectHealth.AT_RISK);
  });

  describe('with no due date', () => {
    const undated = (overrides: Partial<ProjectHealthCounts>) =>
      project({ dueDate: null, counts: counts(overrides) });

    it('is judged on overdue tasks alone', () => {
      expect(health(undated({ overdue: 3 })).health).toBe(ProjectHealth.OFF_TRACK);
    });

    it('is on track when dated tasks are on time', () => {
      expect(health(undated({})).health).toBe(ProjectHealth.ON_TRACK);
      expect(text(project({ dueDate: null }))).toBe('No overdue tasks');
    });

    it('has no update when no open task has a due date either', () => {
      const input = undated({ openWithDueDate: 0 });
      expect(health(input).health).toBe(ProjectHealth.NOT_STARTED);
      expect(text(input)).toBe('Add a due date to track health');
    });

    it('is on track when every task is done', () => {
      const input = undated({ completed: 10, openWithDueDate: 0 });
      expect(health(input).health).toBe(ProjectHealth.ON_TRACK);
      expect(text(input)).toBe('All tasks done');
    });
  });

  it('changes only when the day does', () => {
    const input = project({ counts: counts({ completed: 4 }) });
    expect(health(input, day(6, 20, 0))).toEqual(health(input, day(6, 20, 23)));
  });
});

describe('healthFromLinear', () => {
  const linear = (overrides: Partial<Parameters<typeof healthFromLinear>[0]> = {}) =>
    healthFromLinear({
      status: ProjectStatus.ACTIVE,
      dueDate: day(7, 1),
      completedAt: null,
      health: 'atRisk',
      healthUpdatedAt: day(6, 17, 12),
      ...overrides,
    });

  it("uses Linear's health as it is", () => {
    expect(linear({ health: 'onTrack' }).health).toBe(ProjectHealth.ON_TRACK);
    expect(linear({ health: 'atRisk' }).health).toBe(ProjectHealth.AT_RISK);
    expect(linear({ health: 'offTrack' }).health).toBe(ProjectHealth.OFF_TRACK);
    expect(formatHealthReason(linear().reason, NOW)).toBe('Set in Linear 3 days ago');
  });

  it('has no update when Linear has none', () => {
    const result = linear({ health: null, healthUpdatedAt: null });
    expect(result.health).toBe(ProjectHealth.NOT_STARTED);
    expect(formatHealthReason(result.reason, NOW)).toBe('No update in Linear yet');
  });

  it('is completed for a completed or canceled project, whatever its last update said', () => {
    const result = linear({ status: ProjectStatus.COMPLETED, completedAt: day(6, 30) });
    expect(result.health).toBe(ProjectHealth.COMPLETED);
  });
});

describe('projectHealthCounts', () => {
  let db: BetterSQLite3Database;
  let projects: ProjectService;
  let tasks: TaskService;

  beforeEach(() => {
    db = createDb();
    projects = new ProjectService(db);
    tasks = new TaskService(db);
  });

  it('counts each project in one query, leaving out archived tasks', () => {
    const a = projects.createProject({ title: 'A', dueDate: day(7, 1) });
    const b = projects.createProject({ title: 'B', dueDate: day(7, 1) });
    const empty = projects.createProject({ title: 'Empty', dueDate: day(7, 1) });

    const make = (projectId: ProjectId, title: string, dueDate: Date, priority?: TaskPriority) =>
      tasks.createTask({ title, projectId, dueDate, priority });

    // A: done, cancelled, overdue high, overdue low, due today, undated, and an archived overdue
    const done = make(a.id, 'done', day(6, 1));
    tasks.updateStatus(done.id, TaskStatus.COMPLETED);
    const cancelled = make(a.id, 'cancelled', day(6, 1));
    tasks.updateStatus(cancelled.id, TaskStatus.CANCELLED);
    const parent = make(a.id, 'overdue high', day(6, 19), TaskPriority.HIGH);
    // a subtask carries its parent's project and counts like any task
    tasks.createSubtask(parent.id, { title: 'overdue subtask', dueDate: day(6, 10) });
    make(a.id, 'due today', day(6, 20));
    // createTask needs a due date; a synced task can have none
    const undated = make(a.id, 'undated', day(6, 30));
    db.update(tasksTable).set({ dueDate: null }).where(eq(tasksTable.id, undated.id)).run();
    const archived = make(a.id, 'archived', day(6, 1));
    new ArchiveService(db).archiveTask(archived.id);
    // B: one open task
    make(b.id, 'open', day(6, 25));

    const result = projectHealthCounts(db, [a.id, b.id, empty.id], NOW);
    expect(result.get(a.id)).toEqual({
      total: 5,
      completed: 1,
      cancelled: 1,
      overdue: 2,
      overdueHigh: 1,
      openWithDueDate: 3,
    });
    expect(result.get(b.id)).toMatchObject({ total: 1, overdue: 0, openWithDueDate: 1 });
    expect(result.get(empty.id)).toMatchObject({ total: 0 });
  });

  it('returns an empty map for no ids', () => {
    expect(projectHealthCounts(db, [], NOW).size).toBe(0);
  });

  it('gives an unknown project zeros', () => {
    const id = generateId('project');
    expect(projectHealthCounts(db, [id], NOW).get(id)).toMatchObject({ total: 0 });
  });
});
