import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { resolveColor, type Swatch } from '../../types';
import styles from './ProgressRing.module.css';

export interface ProgressRingProps {
  /** how many are done */
  value: number;
  /** out of how many */
  total: number;
  /** 12–14px in rows and pills (14 by default); larger for project progress on an overview */
  size?: number;
  /** the ring's width; defaults to a seventh of the size, at least 2px */
  stroke?: number;
  /** the fill: a swatch name or a CSS colour; `status-in-progress` by default, the health colour for projects */
  color?: Swatch | string;
  className?: string;
}

/**
 * Completion as a ring on an `input` track: subtasks done in a row (always beside "3/4") and
 * project progress on the overview. Names itself "3 of 4" for screen readers.
 */
export function ProgressRing({
  value,
  total,
  size = 14,
  stroke = Math.max(2, size / 7),
  color,
  className,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  const centre = size / 2;
  const style = color
    ? ({ '--progress-ring-color': resolveColor(color) } as CSSProperties)
    : undefined;
  return (
    <svg
      className={cn(styles.ring, className)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${value} of ${total}`}
      style={style}
    >
      <circle className={styles.track} cx={centre} cy={centre} r={r} strokeWidth={stroke} />
      {fraction > 0 && (
        <circle
          className={styles.indicator}
          cx={centre}
          cy={centre}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      )}
    </svg>
  );
}
