import { Activity, Circle, CirclePause, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import { FilledCheck } from '../StatusIcon';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '../types';
import styles from './ProjectStatusIcon.module.css';

export { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '../types';

export const projectStatusIconVariants = cva(styles.icon, {
  variants: {
    status: {
      'not-started': styles.notStarted,
      active: styles.active,
      'on-hold': styles.onHold,
      completed: styles.completed,
    },
  },
  defaultVariants: { status: 'not-started' },
});

const ICONS: Record<Exclude<ProjectStatus, 'completed'>, LucideIcon> = {
  'not-started': Circle,
  active: Activity,
  'on-hold': CirclePause,
};

export interface ProjectStatusIconProps {
  status: ProjectStatus;
  /** 16px (the default), 12px inside a Badge or EntityPill */
  size?: number;
  className?: string;
}

/**
 * A project's status as a glyph in a task status's colour: `not-started` circle, `active`
 * activity line (in-progress orange), `on-hold` paused circle (grey), `completed` filled check.
 * It carries the status's name for screen readers. Shown in the status pill on project cards,
 * rows and headers; health is not shown for now (`HealthIcon`).
 */
export function ProjectStatusIcon({ status, size = 16, className }: ProjectStatusIconProps) {
  const label = PROJECT_STATUS_LABELS[status];
  const classes = cn(projectStatusIconVariants({ status }), className);
  if (status === 'completed') return <FilledCheck size={size} label={label} className={classes} />;
  return <Icon icon={ICONS[status]} size={size} label={label} className={classes} />;
}
