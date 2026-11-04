import { ChevronDown, ChevronsUp, Equal, type LucideIcon } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import { PRIORITY_LABELS, type Priority } from '../types';
import styles from './PriorityIcon.module.css';

export const priorityIconVariants = cva(undefined, {
  variants: {
    priority: { high: styles.high, medium: styles.medium, low: styles.low },
  },
  defaultVariants: { priority: 'low' },
});

const ICONS: Record<Priority, LucideIcon> = {
  high: ChevronsUp,
  medium: Equal,
  low: ChevronDown,
};

export interface PriorityIconProps {
  priority: Priority;
  /** 16px in rows (the default), 12px inside pills */
  size?: number;
  className?: string;
}

/**
 * A task's priority in its `priority-*` colour: `high` double chevron up, `medium` equals, `low`
 * chevron down, at a heavier stroke so it reads at a glance. Unlabelled in rows (it still names
 * itself to screen readers); inside a Badge with its word on detail pages.
 */
export function PriorityIcon({ priority, size = 16, className }: PriorityIconProps) {
  return (
    <Icon
      icon={ICONS[priority]}
      size={size}
      strokeWidth={2.5}
      label={`${PRIORITY_LABELS[priority]} priority`}
      className={cn(priorityIconVariants({ priority }), className)}
    />
  );
}
