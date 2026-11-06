import { hexColorSchema } from '@common/color';
import {
  ProjectHealth,
  ProjectStatus,
  Provider as CoreProvider,
  TaskPriority,
  TaskStatus,
  type ExternalRef,
} from '@common/types';

/**
 * DevBrain's domain values as the components draw them, and the tokens each maps to. Statuses and
 * priorities are core's own enums (`@common/types`); this file adds their names and colours, so a
 * task row, a board card and a pill agree on them.
 */

/** The six colours users pick for workspaces, projects and calendars. */
export type Swatch = 'red' | 'amber' | 'green' | 'blue' | 'indigo' | 'pink';

/** The provider whose logo a synced item shows. */
export type Provider = 'linear' | 'github';

export const SWATCHES: readonly Swatch[] = ['red', 'amber', 'green', 'blue', 'indigo', 'pink'];

export const PROVIDER_LABELS: Record<Provider, string> = {
  linear: 'Linear',
  github: 'GitHub',
};

/**
 * A service an account connects: what the Integrations page lists. Tasks come from `Provider`s
 * (Linear, GitHub); events come from Google Calendar.
 */
export type IntegrationProvider = 'linear' | 'google-calendar' | 'github';

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  linear: 'Linear',
  'google-calendar': 'Google Calendar',
  github: 'GitHub',
};

/**
 * An event as the calendar stories and screens describe it (`calendarEventInput` makes it
 * CalendarView's FullCalendar input). Times are local `Date`s;
 * an all-day event runs from the start of its first day to the start of the day after its last
 * (`end` is exclusive), as Google Calendar sends them.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  /** the calendar's colour */
  color?: Swatch;
  /**
   * `event` (default), a `task` scheduled on the grid (its status icon), `focus` time (neutral,
   * dashed) or `out-of-office` (a neutral all-day chip)
   */
  kind?: 'event' | 'task' | 'focus' | 'out-of-office';
  /** a scheduled task's status */
  status?: TaskStatus;
  /** you answered "maybe" */
  tentative?: boolean;
  /** the event has a meeting link */
  meeting?: boolean;
}

/** A swatch at full strength (icons, bars, dots): `swatchVar('blue')` → `var(--swatch-blue)` */
export function swatchVar(swatch: Swatch): string {
  return `var(--swatch-${swatch})`;
}

/** A swatch's 900 step, the ground of a workspace tile: `var(--swatch-blue-tile)` */
export function swatchTileVar(swatch: Swatch): string {
  return `var(--swatch-${swatch}-tile)`;
}

/** A swatch at 15%, the ground of a group heading tile: `var(--swatch-blue-tint)` */
export function swatchTintVar(swatch: Swatch): string {
  return `var(--swatch-${swatch}-tint)`;
}

export function isSwatch(value: string): value is Swatch {
  return (SWATCHES as readonly string[]).includes(value);
}

/**
 * A colour prop of a generic part (Badge, ColourBar, SwatchDot) that takes a swatch name or any CSS
 * colour: `'blue'` → `var(--swatch-blue)`, `'var(--status-overdue)'` as it is. Entity components
 * pass it what `resolveColor` gave, never a colour from core as it came.
 */
export function cssColor(color: Swatch | string | null | undefined): string | undefined {
  if (color == null) return undefined;
  return isSwatch(color) ? swatchVar(color) : color;
}

/**
 * An entity's colour as a component draws it: a swatch name becomes its token, a `#rrggbb` string (a
 * project's or calendar's colour from core) is checked with `hexColorSchema` and used as it is,
 * and anything else, null included, gives `fallback` (undefined by default), so a provider's free
 * colour string never reaches a style.
 */
export function resolveColor(
  color: Swatch | string | null | undefined,
  fallback?: Swatch,
): string | undefined {
  if (color != null) {
    if (isSwatch(color)) return swatchVar(color);
    if (hexColorSchema.safeParse(color).success) return color;
  }
  return fallback && swatchVar(fallback);
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: 'Not started',
  [TaskStatus.IN_PROGRESS]: 'In progress',
  [TaskStatus.COMPLETED]: 'Completed',
  [TaskStatus.CANCELLED]: 'Cancelled',
};

/** The name of the flag a row shows for an overdue task. */
export const OVERDUE_LABEL = 'Overdue';

/** The statuses that close a task: never overdue, and drawn without a priority. */
export function isClosed(status: TaskStatus): boolean {
  return status === TaskStatus.COMPLETED || status === TaskStatus.CANCELLED;
}

/**
 * Whether a task is overdue: open, with a due date before today's start (as core counts it in
 * `projects.stats`). A task due today is not.
 */
export function isOverdue(
  status: TaskStatus,
  dueDate: Date | null | undefined,
  now: Date,
): boolean {
  if (dueDate == null || isClosed(status)) return false;
  return dueDate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** Whether a date falls on `now`'s day. */
export function isToday(date: Date, now: Date): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * How a due date is coloured: `overdue` (`date-overdue`) for an overdue task, `today`
 * (`date-today`) for an open task due today, else none. A closed task's date is never coloured.
 */
export function dueTone(
  status: TaskStatus,
  dueDate: Date | null | undefined,
  now: Date,
): 'today' | 'overdue' | undefined {
  return dateTone(dueDate, now, isClosed(status));
}

/** `dueTone` for anything with a due date: none once it is `closed` (a completed project). */
export function dateTone(
  dueDate: Date | null | undefined,
  now: Date,
  closed = false,
): 'today' | 'overdue' | undefined {
  if (dueDate == null || closed) return undefined;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dueDate.getTime() < startOfToday.getTime()) return 'overdue';
  return isToday(dueDate, now) ? 'today' : undefined;
}

/**
 * The flag an overdue task's icon shows instead of its status: while it is overdue and not yet
 * started (an overdue task in progress keeps its activity line, with its date in red).
 */
export function showsOverdueFlag(status: TaskStatus, overdue: boolean): boolean {
  return overdue && status === TaskStatus.NOT_STARTED;
}

const STATUS_SLUGS: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: 'not-started',
  [TaskStatus.IN_PROGRESS]: 'in-progress',
  [TaskStatus.COMPLETED]: 'completed',
  [TaskStatus.CANCELLED]: 'cancelled',
};

/** A status's token name, `overdue` for the flag: `statusSlug(TaskStatus.IN_PROGRESS)` → `in-progress` */
export function statusSlug(status: TaskStatus, overdue = false): string {
  return overdue ? 'overdue' : STATUS_SLUGS[status];
}

/** A task status's colour token: `statusVar(TaskStatus.IN_PROGRESS)` → `var(--status-in-progress)` */
export function statusVar(status: TaskStatus, overdue = false): string {
  return `var(--status-${statusSlug(status, overdue)})`;
}

/**
 * A task status's 15% tint, for group heading tiles. Not started and cancelled have none: their
 * tiles keep the neutral `secondary` ground.
 */
export function statusTintVar(status: TaskStatus, overdue = false): string {
  return overdue || status === TaskStatus.IN_PROGRESS || status === TaskStatus.COMPLETED
    ? `var(--status-${statusSlug(status, overdue)}-tint)`
    : 'var(--secondary)';
}

/** The priorities in menu order, highest first. */
export const PRIORITIES: readonly TaskPriority[] = [
  TaskPriority.HIGH,
  TaskPriority.MEDIUM,
  TaskPriority.LOW,
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.HIGH]: 'High',
  [TaskPriority.MEDIUM]: 'Medium',
  [TaskPriority.LOW]: 'Low',
};

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  [ProjectHealth.ON_TRACK]: 'On track',
  [ProjectHealth.AT_RISK]: 'At risk',
  [ProjectHealth.OFF_TRACK]: 'Off track',
  [ProjectHealth.NOT_STARTED]: 'Not started',
  [ProjectHealth.COMPLETED]: 'Completed',
};

/** A project's statuses in menu order. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  ProjectStatus.NOT_STARTED,
  ProjectStatus.ACTIVE,
  ProjectStatus.ON_HOLD,
  ProjectStatus.COMPLETED,
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [ProjectStatus.NOT_STARTED]: 'Not started',
  [ProjectStatus.ACTIVE]: 'Active',
  [ProjectStatus.ON_HOLD]: 'On hold',
  [ProjectStatus.COMPLETED]: 'Completed',
};

/** The logo a synced item's key shows, from its link; undefined for a provider with no logo. */
export function providerOf(external: Pick<ExternalRef, 'provider'>): Provider | undefined {
  return external.provider === CoreProvider.LINEAR ? 'linear' : undefined;
}

/** Done of total as a whole percent: 0 with no tasks. */
export function percentOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
