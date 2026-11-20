import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { TaskPriority } from '@common/types';
import { PRIORITY_LABELS } from '../../types';
import styles from './PriorityIcon.module.css';

export const priorityIconVariants = cva(styles.icon, {
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

/** how many of the three bars are filled */
const LEVELS: Record<TaskPriority, number> = {
  [TaskPriority.HIGH]: 3,
  [TaskPriority.MEDIUM]: 2,
  [TaskPriority.LOW]: 1,
  [TaskPriority.NONE]: 0,
};

// three rising bars on a 24px grid, bottoms aligned at y=20
const BARS = [
  { x: 4, height: 7 },
  { x: 10.25, height: 11.5 },
  { x: 16.5, height: 16 },
];

export interface PriorityIconProps {
  priority: TaskPriority;
  /** 16px in rows (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's priority (core's `TaskPriority`) as a gauge of three rising bars, filled up to its
 * level: all three for `high` (in `priority-high`), two for `medium`, one for `low` (both
 * `muted-foreground`), the rest a faint track. `none` (a synced task whose provider has no
 * priority set) is the track alone. Every level is the same width, so a column of them lines up.
 * Unlabelled in rows (it still names itself to screen readers); inside a Badge with its word on
 * detail pages.
 */
export function PriorityIcon({ priority, size = 16, className }: PriorityIconProps) {
  const level = LEVELS[priority];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={
        priority === TaskPriority.NONE
          ? PRIORITY_LABELS[priority]
          : `${PRIORITY_LABELS[priority]} priority`
      }
      className={cn(priorityIconVariants({ priority }), className)}
    >
      {BARS.map((bar, i) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={20 - bar.height}
          width={3.5}
          height={bar.height}
          rx={1.25}
          className={i < level ? styles.filled : styles.track}
        />
      ))}
    </svg>
  );
}
