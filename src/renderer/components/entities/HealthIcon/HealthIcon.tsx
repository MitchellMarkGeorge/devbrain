import { Circle, CircleAlert, CircleX, Clock, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { FilledCheck } from '../StatusIcon';
import { HEALTH_LABELS, type Health } from '../../types';
import styles from './HealthIcon.module.css';

export const healthIconVariants = cva(undefined, {
  variants: {
    health: {
      'on-track': styles.onTrack,
      'at-risk': styles.atRisk,
      'off-track': styles.offTrack,
      'not-started': styles.notStarted,
      completed: styles.completed,
    },
  },
  defaultVariants: { health: 'not-started' },
});

const ICONS: Record<Exclude<Health, 'completed'>, LucideIcon> = {
  'on-track': Clock,
  'at-risk': CircleAlert,
  'off-track': CircleX,
  'not-started': Circle,
};

export interface HealthIconProps {
  health: Health;
  /** 16px (the default), 12px inside a Badge */
  size?: number;
  className?: string;
}

/**
 * A project's health in its `health-*` colour: `on-track` clock, `at-risk` alert circle,
 * `off-track` x circle, `not-started` circle, `completed` filled check. In the project header it
 * sits in an outline Badge with its label.
 */
export function HealthIcon({ health, size = 16, className }: HealthIconProps) {
  const label = HEALTH_LABELS[health];
  const classes = cn(healthIconVariants({ health }), className);
  if (health === 'completed') return <FilledCheck size={size} label={label} className={classes} />;
  return <Icon icon={ICONS[health]} size={size} label={label} className={classes} />;
}
