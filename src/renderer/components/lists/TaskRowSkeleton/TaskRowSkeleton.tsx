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
      <span className={styles.status}>
        <Skeleton width={16} height={16} />
      </span>
      <span className={styles.title}>
        <Skeleton className={styles.line} width={titleWidth} />
        <Skeleton className={styles.line} width={48} />
      </span>
      <span className={styles.side}>
        <Skeleton className={styles.pill} width={104} />
        <span className={styles.priority}>
          <Skeleton className={styles.line} width={16} />
        </span>
        <span className={styles.date}>
          <Skeleton className={styles.line} width={40} />
        </span>
      </span>
    </div>
  );
}
