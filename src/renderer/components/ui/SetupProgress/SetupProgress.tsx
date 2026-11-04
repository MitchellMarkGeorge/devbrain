import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './SetupProgress.module.css';

export interface SetupProgressProps extends ComponentPropsWithoutRef<'div'> {
  /** steps done: calendar or Linear, first task, first note */
  done: number;
  total?: number;
}

/**
 * The first-run Home's slim setup pill at the top right: "Setup 2 of 3" and a dot per step,
 * filled once done.
 */
export const SetupProgress = forwardRef<HTMLDivElement, SetupProgressProps>(function SetupProgress(
  { done, total = 3, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label="Setup"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className={cn(styles.progress, className)}
      {...props}
    >
      <span className={styles.label}>Setup</span>
      <span className={styles.count}>
        {done} of {total}
      </span>
      <span className={styles.dots} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.dot} data-done={i < done ? '' : undefined} />
        ))}
      </span>
    </div>
  );
});
