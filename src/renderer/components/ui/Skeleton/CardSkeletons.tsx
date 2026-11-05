import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './Skeleton';
import styles from './CardSkeletons.module.css';

type SkeletonFrameProps = ComponentPropsWithoutRef<'div'>;

/** A loading `NoteCard` (Notes cards): icon and edited, title, two excerpt lines, then the pill. */
export const NoteCardSkeleton = forwardRef<HTMLDivElement, SkeletonFrameProps>(
  function NoteCardSkeleton({ className, ...props }, ref) {
    return (
      <div ref={ref} aria-hidden className={cn(styles.card, styles.note, className)} {...props}>
        <div className={styles.line}>
          <Skeleton shape="icon" width={16} height={16} />
          <Skeleton width={40} height={12} className={styles.end} />
        </div>
        <Skeleton width={180} height={14} />
        <div className={styles.lines}>
          <Skeleton width="100%" height={10} />
          <Skeleton width={220} height={10} />
        </div>
        <Skeleton shape="circle" width={112} height={22} className={styles.foot} />
      </div>
    );
  },
);

/**
 * A loading detail page (task, project, note) under its header: the title, three description
 * lines, a subtasks heading and four rows, in the 720px column.
 */
export const DetailSkeleton = forwardRef<HTMLDivElement, SkeletonFrameProps>(
  function DetailSkeleton({ className, ...props }, ref) {
    return (
      <div ref={ref} aria-hidden className={cn(styles.detail, className)} {...props}>
        <Skeleton width={380} height={28} className={styles.title} />
        <div className={cn(styles.lines, styles.description)}>
          <Skeleton width="100%" height={12} />
          <Skeleton width="96%" height={12} />
          <Skeleton width="72%" height={12} />
        </div>
        <div className={styles.subtasks}>
          <div className={styles.subtasksHeading}>
            <Skeleton width={72} height={14} />
            <Skeleton width={28} height={14} />
          </div>
          {[200, 140, 220, 160].map((width) => (
            <div key={width} className={styles.row}>
              <Skeleton shape="icon" width={16} height={16} />
              <Skeleton width={width} height={12} />
              <Skeleton width={40} height={12} className={styles.end} />
            </div>
          ))}
        </div>
      </div>
    );
  },
);
