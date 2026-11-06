import { Circle, CircleAlert, CircleX, Clock, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { FilledCheck } from '../StatusIcon';
import { ProjectHealth } from '@common/types';
import { HEALTH_LABELS } from '../../types';
import styles from './HealthIcon.module.css';

export const healthIconVariants = cva(undefined, {
  variants: {
    health: {
      [ProjectHealth.ON_TRACK]: styles.onTrack,
      [ProjectHealth.AT_RISK]: styles.atRisk,
      [ProjectHealth.OFF_TRACK]: styles.offTrack,
      [ProjectHealth.NOT_STARTED]: styles.notStarted,
      [ProjectHealth.COMPLETED]: styles.completed,
    },
  },
  defaultVariants: { health: ProjectHealth.NOT_STARTED },
});

const ICONS: Record<Exclude<ProjectHealth, ProjectHealth.COMPLETED>, LucideIcon> = {
  [ProjectHealth.ON_TRACK]: Clock,
  [ProjectHealth.AT_RISK]: CircleAlert,
  [ProjectHealth.OFF_TRACK]: CircleX,
  [ProjectHealth.NOT_STARTED]: Circle,
};

export interface HealthIconProps {
  health: ProjectHealth;
  /** 16px (the default), 12px inside a Badge */
  size?: number;
  className?: string;
}

/**
 * A project's health (core's `ProjectHealth`) in its `health-*` colour: `on-track` clock, `at-risk` alert circle,
 * `off-track` x circle, `not-started` circle, `completed` filled check. In the project header it
 * sits in an outline Badge with its label.
 */
export function HealthIcon({ health, size = 16, className }: HealthIconProps) {
  const label = HEALTH_LABELS[health];
  const classes = cn(healthIconVariants({ health }), className);
  if (health === ProjectHealth.COMPLETED)
    return <FilledCheck size={size} label={label} className={classes} />;
  return <Icon icon={ICONS[health]} size={size} label={label} className={classes} />;
}
