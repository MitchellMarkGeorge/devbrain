import { forwardRef, type CSSProperties, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './NewBadge.module.css';

export interface NewBadgeProps extends ComponentPropsWithoutRef<'span'> {
  /**
   * how long the badge shows before it fades out, in milliseconds (default 4000); `false` keeps it.
   * Once faded it stays in place, invisible, so the row it sits in doesn't shift.
   */
  fadeAfter?: number | false;
  /** called when the fade has finished: drop the badge from the item then */
  onFaded?: () => void;
}

/**
 * Marks an item just created on the first-run Home: a 20px pill with a `border-strong` outline
 * and a 12px medium "New" in `foreground`, which fades after a few seconds.
 */
export const NewBadge = forwardRef<HTMLSpanElement, NewBadgeProps>(function NewBadge(
  { fadeAfter = 4000, onFaded, className, style, children = 'New', onAnimationEnd, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      data-slot="new-badge"
      className={cn(styles.badge, fadeAfter !== false && styles.fades, className)}
      style={
        fadeAfter !== false
          ? ({ '--new-badge-delay': `${fadeAfter}ms`, ...style } as CSSProperties)
          : style
      }
      onAnimationEnd={(event) => {
        onAnimationEnd?.(event);
        if (event.target === event.currentTarget) onFaded?.();
      }}
      {...props}
    >
      {children}
    </span>
  );
});
