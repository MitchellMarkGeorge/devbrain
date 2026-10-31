// PROPOSAL (docs/projects/health.md): how a project's health could be worked out. Nothing imports
// this yet: it is not wired into ProjectService, IPC or the schema. The rules and thresholds are
// the ones the doc puts up for a decision.
//
// Health is judged in whole local days (the system zone, see shared/dates.ts): a task due today is
// not overdue until tomorrow, and the share of time gone only moves at midnight. So between writes
// a project's health changes only when the day does, which is what lets the renderer stay current
// with one refresh at local midnight.

import { ProjectId } from '@common/ids';
import { and, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tasks } from '@main/db/schema/tasks';
import { localDayWindow } from '../shared/dates';
import { TaskPriority, TaskStatus } from '../tasks/types';
import { ProjectHealth, ProjectStatus } from './types';

// The task counts health is judged on: unarchived tasks of the project, subtasks included (they
// carry their parent's projectId, as in ProjectService.getProjectStats).
export interface ProjectHealthCounts {
  // completed and open tasks; cancelled ones are left out so they do not dilute progress
  total: number;
  completed: number;
  cancelled: number;
  // open tasks due before today
  overdue: number;
  // of those, the HIGH priority ones
  overdueHigh: number;
  // open tasks that have a due date, overdue or not
  openWithDueDate: number;
}

export interface ProjectHealthInput {
  status: ProjectStatus;
  startDate: Date | null;
  dueDate: Date | null;
  // the schedule's start when the project has no start date
  createdAt: Date;
  completedAt: Date | null;
  counts: ProjectHealthCounts;
}

// Why a project has its health, as data: the renderer words it (formatHealthReason below is a
// sketch of that). Shares are 0..1.
export type HealthReason =
  | { code: 'completed'; completedAt: Date | null; daysLate: number }
  | { code: 'on_hold' }
  | { code: 'past_due'; daysOverdue: number }
  | { code: 'no_tasks' }
  | { code: 'all_cancelled' }
  | { code: 'starts_later'; startsOn: Date }
  | { code: 'nothing_dated' }
  | { code: 'all_done' }
  | { code: 'overdue_tasks'; count: number; high: number }
  | { code: 'behind_schedule'; done: number; elapsed: number }
  | { code: 'on_pace'; done: number; elapsed: number }
  | { code: 'no_overdue_tasks' }
  // a synced project: the provider's own health (Linear's latest project update)
  | { code: 'provider'; provider: 'linear'; updatedAt: Date | null }
  | { code: 'provider_no_update'; provider: 'linear' };

export interface ProjectHealthResult {
  health: ProjectHealth;
  // the headline, shown beside the badge
  reason: HealthReason;
  // the other signals that were judged, worst first, for a tooltip or the overview
  also: HealthReason[];
}

// The thresholds, together so they are easy to tune. `gap` is the share of time gone minus the
// share of tasks done.
export const HEALTH_THRESHOLDS = {
  // behind by more than this is at risk ("40% done with 70% of the time gone": 0.30)
  atRiskGap: 0.2,
  // behind by more than this is off track ("20% done with 70% of the time gone": 0.50)
  offTrackGap: 0.4,
  // the schedule is not judged until this share of the time is gone, so a new project is not at
  // risk on day two for having nothing done yet
  graceElapsed: 0.2,
  // this many overdue tasks is off track; fewer is at risk
  offTrackOverdue: 3,
  // this many overdue HIGH priority tasks is off track on its own
  offTrackOverdueHigh: 2,
} as const;

const DAY_MS = 86_400_000;

// whole local days from a's day to b's day; Math.round absorbs the 23 and 25 hour days of DST
export function daysBetween(a: Date, b: Date): number {
  const from = localDayWindow(a).startOfDay.getTime();
  const to = localDayWindow(b).startOfDay.getTime();
  return Math.round((to - from) / DAY_MS);
}

// OFF_TRACK < AT_RISK < ON_TRACK, for "worst wins". NOT_STARTED and COMPLETED never compete.
const SEVERITY: Partial<Record<ProjectHealth, number>> = {
  [ProjectHealth.OFF_TRACK]: 0,
  [ProjectHealth.AT_RISK]: 1,
  [ProjectHealth.ON_TRACK]: 2,
};

interface Signal {
  health: ProjectHealth;
  reason: HealthReason;
}

/**
 * A local project's health on the day `now` falls on. Pure: the same input and day always give the
 * same answer. Rules in order (docs/projects/health.md has them as a table):
 *
 * 1. completed → COMPLETED
 * 2. on hold → no update
 * 3. due date passed → OFF_TRACK
 * 4. no tasks, or all cancelled → no update
 * 5. otherwise the worst of the overdue-tasks signal and the schedule signal
 * 6. nothing to judge (no due date and no dated tasks, or not started yet) → no update
 */
export function computeProjectHealth(input: ProjectHealthInput, now: Date): ProjectHealthResult {
  const { status, dueDate, counts } = input;
  const result = (health: ProjectHealth, reason: HealthReason, also: HealthReason[] = []) => ({
    health,
    reason,
    also,
  });

  if (status === ProjectStatus.COMPLETED) {
    const daysLate =
      dueDate && input.completedAt ? Math.max(0, daysBetween(dueDate, input.completedAt)) : 0;
    return result(ProjectHealth.COMPLETED, {
      code: 'completed',
      completedAt: input.completedAt,
      daysLate,
    });
  }

  // a pause is the user's decision, so the dates stop counting against the project
  if (status === ProjectStatus.ON_HOLD) {
    return result(ProjectHealth.NOT_STARTED, { code: 'on_hold' });
  }

  if (dueDate && daysBetween(dueDate, now) > 0) {
    return result(ProjectHealth.OFF_TRACK, {
      code: 'past_due',
      daysOverdue: daysBetween(dueDate, now),
    });
  }

  if (counts.total === 0) {
    return result(ProjectHealth.NOT_STARTED, {
      code: counts.cancelled > 0 ? 'all_cancelled' : 'no_tasks',
    });
  }

  const signals: Signal[] = [];

  // overdue tasks count whatever the project's dates say
  if (counts.overdue > 0) {
    const offTrack =
      counts.overdue >= HEALTH_THRESHOLDS.offTrackOverdue ||
      counts.overdueHigh >= HEALTH_THRESHOLDS.offTrackOverdueHigh;
    signals.push({
      health: offTrack ? ProjectHealth.OFF_TRACK : ProjectHealth.AT_RISK,
      reason: { code: 'overdue_tasks', count: counts.overdue, high: counts.overdueHigh },
    });
  }

  // the schedule, from the start (or the day the project was made) to the due date
  const start = input.startDate ?? input.createdAt;
  const startsLater = daysBetween(now, start) > 0;
  const done = counts.completed / counts.total;
  if (dueDate && !startsLater) {
    const span = Math.max(1, daysBetween(start, dueDate));
    const elapsed = Math.min(1, Math.max(0, daysBetween(start, now) / span));
    const gap = elapsed - done;
    let health: ProjectHealth = ProjectHealth.ON_TRACK;
    if (elapsed >= HEALTH_THRESHOLDS.graceElapsed) {
      if (gap > HEALTH_THRESHOLDS.offTrackGap) health = ProjectHealth.OFF_TRACK;
      else if (gap > HEALTH_THRESHOLDS.atRiskGap) health = ProjectHealth.AT_RISK;
    }
    signals.push({
      health,
      reason: {
        code: health === ProjectHealth.ON_TRACK ? 'on_pace' : 'behind_schedule',
        done,
        elapsed,
      },
    });
  }

  if (signals.length === 0) {
    // nothing overdue, and no schedule to measure against
    if (counts.completed === counts.total)
      return result(ProjectHealth.ON_TRACK, { code: 'all_done' });
    if (startsLater) {
      return result(ProjectHealth.NOT_STARTED, { code: 'starts_later', startsOn: start });
    }
    if (counts.openWithDueDate === 0) {
      return result(ProjectHealth.NOT_STARTED, { code: 'nothing_dated' });
    }
    return result(ProjectHealth.ON_TRACK, { code: 'no_overdue_tasks' });
  }

  // worst first; on a tie the overdue tasks lead, as the more concrete reason (pushed first, and
  // the sort is stable)
  signals.sort((a, b) => SEVERITY[a.health]! - SEVERITY[b.health]!);
  const [worst, ...rest] = signals;
  return result(
    worst.health,
    worst.reason,
    rest.map((signal) => signal.reason),
  );
}

// Linear's project health (Project.health, set by its latest project update)
export type LinearProjectHealth = 'onTrack' | 'atRisk' | 'offTrack';

const LINEAR_HEALTH: Record<LinearProjectHealth, ProjectHealth> = {
  onTrack: ProjectHealth.ON_TRACK,
  atRisk: ProjectHealth.AT_RISK,
  offTrack: ProjectHealth.OFF_TRACK,
};

/**
 * A synced Linear project's health: Linear's own, never one worked out from DevBrain's tasks, which
 * hold only the issues assigned to the user. A project with no update yet has no update here too.
 */
export function healthFromLinear(input: {
  status: ProjectStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  health: LinearProjectHealth | null;
  healthUpdatedAt: Date | null;
}): ProjectHealthResult {
  if (input.status === ProjectStatus.COMPLETED) {
    const daysLate =
      input.dueDate && input.completedAt
        ? Math.max(0, daysBetween(input.dueDate, input.completedAt))
        : 0;
    return {
      health: ProjectHealth.COMPLETED,
      reason: { code: 'completed', completedAt: input.completedAt, daysLate },
      also: [],
    };
  }
  if (input.health === null) {
    return {
      health: ProjectHealth.NOT_STARTED,
      reason: { code: 'provider_no_update', provider: 'linear' },
      also: [],
    };
  }
  return {
    health: LINEAR_HEALTH[input.health],
    reason: { code: 'provider', provider: 'linear', updatedAt: input.healthUpdatedAt },
    also: [],
  };
}

const EMPTY_COUNTS: ProjectHealthCounts = {
  total: 0,
  completed: 0,
  cancelled: 0,
  overdue: 0,
  overdueHigh: 0,
  openWithDueDate: 0,
};

/**
 * The counts for many projects in one grouped query, so a page of cards needs no call per project.
 * Uses idx_tasks_project_id (partial on archived_at IS NULL, as this filter is). A project with no
 * tasks gets zeros.
 */
export function projectHealthCounts(
  db: BetterSQLite3Database,
  projectIds: ProjectId[],
  now: Date,
): Map<ProjectId, ProjectHealthCounts> {
  const counts = new Map<ProjectId, ProjectHealthCounts>(
    projectIds.map((id) => [id, { ...EMPTY_COUNTS }]),
  );
  if (projectIds.length === 0) return counts;

  // due before today: a task due today is not overdue yet
  const { startOfDay } = localDayWindow(now);
  const open = sql`${tasks.status} NOT IN (${TaskStatus.COMPLETED}, ${TaskStatus.CANCELLED})`;
  const overdue = sql`${open} AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${startOfDay.getTime()}`;
  const count = (predicate: SQL) =>
    sql<number>`coalesce(sum(case when ${predicate} then 1 else 0 end), 0)`;

  const rows = db
    .select({
      projectId: tasks.projectId,
      total: count(sql`${tasks.status} != ${TaskStatus.CANCELLED}`),
      completed: count(sql`${tasks.status} = ${TaskStatus.COMPLETED}`),
      cancelled: count(sql`${tasks.status} = ${TaskStatus.CANCELLED}`),
      overdue: count(overdue),
      overdueHigh: count(sql`${overdue} AND ${tasks.priority} = ${TaskPriority.HIGH}`),
      openWithDueDate: count(sql`${open} AND ${tasks.dueDate} IS NOT NULL`),
    })
    .from(tasks)
    .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.archivedAt)))
    .groupBy(tasks.projectId)
    .all();

  for (const { projectId, ...row } of rows) {
    if (projectId !== null) counts.set(projectId, row);
  }
  return counts;
}

// one project's counts, for the overview
export function projectHealthCountsFor(
  db: BetterSQLite3Database,
  projectId: ProjectId,
  now: Date,
): ProjectHealthCounts {
  return projectHealthCounts(db, [projectId], now).get(projectId) ?? { ...EMPTY_COUNTS };
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const shortDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * A sketch of how the renderer would word a reason (it belongs in the renderer, with the label
 * text; here so the doc's examples are tested).
 */
export function formatHealthReason(reason: HealthReason, now: Date): string {
  switch (reason.code) {
    case 'completed':
      if (reason.daysLate > 0) return `Completed ${plural(reason.daysLate, 'day')} late`;
      return reason.completedAt ? `Completed ${shortDate(reason.completedAt)}` : 'Completed';
    case 'on_hold':
      return 'On hold';
    case 'past_due':
      return `Due date passed ${plural(reason.daysOverdue, 'day')} ago`;
    case 'no_tasks':
      return 'No tasks yet';
    case 'all_cancelled':
      return 'All tasks cancelled';
    case 'starts_later':
      return `Starts ${shortDate(reason.startsOn)}`;
    case 'nothing_dated':
      return 'Add a due date to track health';
    case 'all_done':
      return 'All tasks done';
    case 'overdue_tasks':
      return reason.high > 0
        ? `${plural(reason.count, 'overdue task')}, ${reason.high} high priority`
        : plural(reason.count, 'overdue task');
    case 'behind_schedule':
    case 'on_pace':
      return `${percent(reason.done)} done with ${percent(reason.elapsed)} of the time gone`;
    case 'no_overdue_tasks':
      return 'No overdue tasks';
    case 'provider': {
      if (!reason.updatedAt) return 'Set in Linear';
      const days = daysBetween(reason.updatedAt, now);
      return days === 0 ? 'Set in Linear today' : `Set in Linear ${plural(days, 'day')} ago`;
    }
    case 'provider_no_update':
      return 'No update in Linear yet';
  }
}
