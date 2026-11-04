import type { ReactNode } from 'react';
import { Progress as BaseProgress } from '@base-ui/react/progress';
import { mergeClassName } from '../../lib/cn';
import styles from './Progress.module.css';

export interface ProgressProps extends Omit<BaseProgress.Root.Props, 'children'> {
  /** an optional label above the bar ("3 of 12 tasks done"); the value shows on its right */
  label?: ReactNode;
  /** show the formatted value ("25%") on the right of the label */
  showValue?: boolean;
}

/** A 4px round bar on an `input` track with a green fill. */
export function Progress({ label, showValue, className, ...props }: ProgressProps) {
  return (
    <BaseProgress.Root className={mergeClassName(styles.root, className)} {...props}>
      {(label != null || showValue) && (
        <div className={styles.label}>
          {label != null && <BaseProgress.Label>{label}</BaseProgress.Label>}
          {showValue && <BaseProgress.Value />}
        </div>
      )}
      <BaseProgress.Track className={styles.track}>
        <BaseProgress.Indicator className={styles.indicator} />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
