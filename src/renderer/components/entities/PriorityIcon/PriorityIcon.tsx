import { ChevronDown, ChevronsUp, Equal, Minus, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import { TaskPriority } from '@common/types';
import { PRIORITY_LABELS } from '../../types';
import styles from './PriorityIcon.module.css';

export const priorityIconVariants = cva(undefined, {
  variants: {
    priority: {
      [TaskPriority.HIGH]: styles.high,
      [TaskPriority.MEDIUM]: styles.medium,
      [TaskPriority.LOW]: styles.low,
      [TaskPriority.NONE]: styles.none,
    },
  },
  defaultVariants: { priority: TaskPriority.LOW },
});

const ICONS: Record<TaskPriority, LucideIcon> = {
  [TaskPriority.HIGH]: ChevronsUp,
  [TaskPriority.MEDIUM]: Equal,
  [TaskPriority.LOW]: ChevronDown,
  [TaskPriority.NONE]: Minus,
};

export interface PriorityIconProps {
  priority: TaskPriority;
  /** 16px in rows (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's priority (core's `TaskPriority`) in its `priority-*` colour: `high` double chevron up, `medium` equals, `low`
 * chevron down, at a heavier stroke so it reads at a glance. Unlabelled in rows (it still names
 * itself to screen readers); inside a Badge with its word on detail pages. `none` (a synced task
 * whose provider has no priority set) is a neutral dash in `muted-foreground`.
 */
export function PriorityIcon({ priority, size = 16, className }: PriorityIconProps) {
  return (
    <Icon
      icon={ICONS[priority]}
      size={size}
      strokeWidth={2.5}
      label={
        priority === TaskPriority.NONE
          ? PRIORITY_LABELS[priority]
          : `${PRIORITY_LABELS[priority]} priority`
      }
      className={cn(priorityIconVariants({ priority }), className)}
    />
  );
}
