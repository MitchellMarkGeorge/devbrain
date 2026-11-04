import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import { Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../Icon';
import { resolveColor, type Swatch } from '../types';
import styles from './EventBlock.module.css';

export const eventBlockVariants = cva(styles.block, {
  variants: {
    /** `compact` puts the title and time on one line, for events under about 40px tall */
    size: { default: undefined, compact: styles.compact },
  },
  defaultVariants: { size: 'default' },
});

export interface EventBlockProps
  extends useRender.ComponentProps<'div'>, VariantProps<typeof eventBlockVariants> {
  title: string;
  /** "9:00 – 9:30 AM" */
  time: string;
  /** the calendar's colour: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** shows the video icon: the event has a meeting link */
  meeting?: boolean;
}

/**
 * An event in the day and week grid: `muted` ground, the calendar's colour bar, the title and
 * time. The grid positions it (`style={{ top, height }}`).
 */
export const EventBlock = forwardRef<HTMLDivElement, EventBlockProps>(function EventBlock(
  { title, time, color, meeting, size, render, ...props },
  ref,
) {
  return useRender({
    ref,
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: eventBlockVariants({ size }),
        tabIndex: 0,
        children: (
          <>
            <span
              className={styles.bar}
              style={{ '--bar-color': resolveColor(color) } as CSSProperties}
            />
            <div className={styles.body}>
              <div className={styles.title}>{title}</div>
              <div className={styles.time}>
                {time}
                {meeting && <Icon icon={Video} size={12} label="Has a meeting link" />}
              </div>
            </div>
          </>
        ),
      },
      props,
    ),
  });
});

export const nowIndicatorVariants = cva(styles.now, {
  variants: { dot: { true: styles.withDot } },
  defaultVariants: { dot: true },
});

export interface NowIndicatorProps
  extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof nowIndicatorVariants> {}

/** The red current-time line across the time grid; the grid positions it. */
export function NowIndicator({ dot, className, ...props }: NowIndicatorProps) {
  return (
    <div role="presentation" className={cn(nowIndicatorVariants({ dot }), className)} {...props} />
  );
}
