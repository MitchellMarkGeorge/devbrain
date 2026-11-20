import { Circle, CircleSlash, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { TaskStatus } from '@common/types';
import { TASK_STATUS_LABELS } from '../../types';
import { CoreCircle } from './CoreCircle';
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
  },
  defaultVariants: { status: TaskStatus.NOT_STARTED },
});

const ICONS: Record<
  Exclude<TaskStatus, TaskStatus.COMPLETED | TaskStatus.IN_PROGRESS>,
  LucideIcon
> = {
  [TaskStatus.NOT_STARTED]: Circle,
  [TaskStatus.CANCELLED]: CircleSlash,
};

export interface StatusIconProps {
  status: TaskStatus;
  /** 16px in rows and menus (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's status (core's `TaskStatus`) as an icon in its `status-*` colour: not started circle,
 * in progress circle with a solid core, completed filled check, cancelled slashed circle. It carries the status's name for screen readers. In a row it sits inside the button
 * that opens the `StatusMenu`.
 */
export function StatusIcon({ status, size = 16, className }: StatusIconProps) {
  const label = TASK_STATUS_LABELS[status];
  const classes = cn(statusIconVariants({ status }), className);
  if (status === TaskStatus.COMPLETED) {
    return <FilledCheck size={size} label={label} className={classes} />;
  }
  if (status === TaskStatus.IN_PROGRESS) {
    return <CoreCircle size={size} label={label} className={classes} />;
  }
  return <Icon icon={ICONS[status]} size={size} label={label} className={classes} />;
}
