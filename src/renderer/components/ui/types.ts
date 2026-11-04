/**
 * DevBrain's domain values as the components take them, and the tokens each maps to.
 * Components share these so a task row, a board card and a pill agree on names and colours.
 */

/** A task's status. `overdue` is derived from the due date and shows until the task starts. */
export type TaskStatus = 'not-started' | 'in-progress' | 'completed' | 'overdue' | 'cancelled';

export type Priority = 'high' | 'medium' | 'low';

/** A project's health, matching `ProjectHealth`. */
export type Health = 'on-track' | 'at-risk' | 'off-track' | 'not-started' | 'completed';

/** The six colours users pick for workspaces, projects and calendars. */
export type Swatch = 'red' | 'amber' | 'green' | 'blue' | 'indigo' | 'pink';

/** Where a synced task comes from. */
export type Provider = 'linear' | 'github';

export const SWATCHES: readonly Swatch[] = ['red', 'amber', 'green', 'blue', 'indigo', 'pink'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const HEALTH_LABELS: Record<Health, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  'not-started': 'Not started',
  completed: 'Completed',
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  linear: 'Linear',
  github: 'GitHub',
};

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

/** A colour prop that takes a swatch name or any CSS colour: `'blue'` → `var(--swatch-blue)` */
export function resolveColor(color: Swatch | string | undefined): string | undefined {
  if (color == null) return undefined;
  return isSwatch(color) ? swatchVar(color) : color;
}

/** A task status's colour token: `statusVar('in-progress')` → `var(--status-in-progress)` */
export function statusVar(status: TaskStatus): string {
  return `var(--status-${status})`;
}

/**
 * A task status's 15% tint, for group heading tiles. Not started and cancelled have none: their
 * tiles keep the neutral `secondary` ground.
 */
export function statusTintVar(status: TaskStatus): string {
  return status === 'in-progress' || status === 'completed' || status === 'overdue'
    ? `var(--status-${status}-tint)`
    : 'var(--secondary)';
}
