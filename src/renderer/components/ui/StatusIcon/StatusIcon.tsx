import { Activity, Circle, CircleSlash, Flag, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import { TASK_STATUS_LABELS, type TaskStatus } from '../types';
import { FilledCheck } from './FilledCheck';
import styles from './StatusIcon.module.css';

export const statusIconVariants = cva(styles.icon, {
  variants: {
    status: {
      'not-started': styles.notStarted,
      'in-progress': styles.inProgress,
      completed: styles.completed,
      overdue: styles.overdue,
      cancelled: styles.cancelled,
    },
  },
  defaultVariants: { status: 'not-started' },
});

const ICONS: Record<Exclude<TaskStatus, 'completed'>, LucideIcon> = {
  'not-started': Circle,
  'in-progress': Activity,
  overdue: Flag,
  cancelled: CircleSlash,
};

export interface StatusIconProps {
  status: TaskStatus;
  /** 16px in rows and menus (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's status as an icon in its `status-*` colour: `not-started` circle, `in-progress`
 * activity line, `completed` filled check, `overdue` flag, `cancelled` slashed circle. It carries
 * the status's name for screen readers. In a row it sits inside the button that opens the
 * `StatusMenu`.
 */
export function StatusIcon({ status, size = 16, className }: StatusIconProps) {
  const label = TASK_STATUS_LABELS[status];
  const classes = cn(statusIconVariants({ status }), className);
  if (status === 'completed') {
    return <FilledCheck size={size} label={label} className={classes} />;
  }
  return <Icon icon={ICONS[status]} size={size} label={label} className={classes} />;
}
