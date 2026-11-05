import type { SVGProps } from 'react';
import styles from './StatusIcon.module.css';

export interface FilledCheckProps extends SVGProps<SVGSVGElement> {
  size?: number;
  label?: string;
}

/**
 * The filled check DevBrain uses for done (a completed task, a completed project): a disc in
 * `currentColor` with a tick in the page colour. Not a Lucide icon.
 */
export function FilledCheck({
  size = 16,
  label = 'Completed',
  className,
  ...props
}: FilledCheckProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className={className}
      {...props}
    >
      <circle cx={12} cy={12} r={10.5} fill="currentColor" />
      <path d="m8 12 3 3 5-6" className={styles.check} />
    </svg>
  );
}
