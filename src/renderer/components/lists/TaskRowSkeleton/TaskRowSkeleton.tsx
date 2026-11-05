import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from '../../ui/Skeleton';
import styles from './TaskRowSkeleton.module.css';

export interface TaskRowSkeletonProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** the title bar's width; vary it row to row (default 240px) */
  titleWidth?: number;
}

/**
 * A `TaskRow` while the list loads: 48px of pulsing blocks where the status, title, key, project
 * pill, priority and date will be. Stack them with no gap and vary `titleWidth`.
 */
export function TaskRowSkeleton({ titleWidth = 240, className, ...props }: TaskRowSkeletonProps) {
  return (
    <div aria-hidden className={cn(styles.row, className)} {...props}>
      <Skeleton width={16} height={16} />
      <Skeleton className={styles.line} width={titleWidth} />
      <Skeleton className={styles.line} width={48} />
      <span className={styles.spacer} />
      <Skeleton className={styles.pill} width={104} />
      <Skeleton className={styles.line} width={16} />
      <Skeleton className={styles.line} width={40} />
    </div>
  );
}
