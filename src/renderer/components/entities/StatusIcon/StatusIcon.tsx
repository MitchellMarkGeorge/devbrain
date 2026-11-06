import { Activity, Circle, CircleSlash, Flag, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { TaskStatus } from '@common/types';
import { OVERDUE_LABEL, TASK_STATUS_LABELS } from '../../types';
import { FilledCheck } from './FilledCheck';
import styles from './StatusIcon.module.css';

export const statusIconVariants = cva(styles.icon, {
  variants: {
    status: {
      [TaskStatus.NOT_STARTED]: styles.notStarted,
      [TaskStatus.IN_PROGRESS]: styles.inProgress,
      [TaskStatus.COMPLETED]: styles.completed,
      [TaskStatus.CANCELLED]: styles.cancelled,
    },
    overdue: { true: styles.overdue },
  },
  defaultVariants: { status: TaskStatus.NOT_STARTED },
});

const ICONS: Record<Exclude<TaskStatus, TaskStatus.COMPLETED>, LucideIcon> = {
  [TaskStatus.NOT_STARTED]: Circle,
  [TaskStatus.IN_PROGRESS]: Activity,
  [TaskStatus.CANCELLED]: CircleSlash,
};

export interface StatusIconProps {
  status: TaskStatus;
  /** draw the overdue flag instead (`isOverdue` and `showsOverdueFlag` in `types.ts` decide) */
  overdue?: boolean;
  /** 16px in rows and menus (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's status (core's `TaskStatus`) as an icon in its `status-*` colour: not started circle,
 * in progress activity line, completed filled check, cancelled slashed circle, and with `overdue`
 * the flag. It carries the status's name for screen readers. In a row it sits inside the button
 * that opens the `StatusMenu`.
 */
export function StatusIcon({ status, overdue = false, size = 16, className }: StatusIconProps) {
  const label = overdue ? OVERDUE_LABEL : TASK_STATUS_LABELS[status];
  const classes = cn(statusIconVariants({ status, overdue }), className);
  if (overdue) return <Icon icon={Flag} size={size} label={label} className={classes} />;
  if (status === TaskStatus.COMPLETED) {
    return <FilledCheck size={size} label={label} className={classes} />;
  }
  return <Icon icon={ICONS[status]} size={size} label={label} className={classes} />;
}
