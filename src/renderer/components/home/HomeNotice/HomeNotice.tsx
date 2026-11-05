import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import styles from './HomeNotice.module.css';

export interface HomeNoticeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the glyph in the 40px tile: a completed `StatusIcon` (20px) for "Your day is clear" */
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** the button at the right: "Review Week" */
  action?: ReactNode;
}

/**
 * Home's good-news card when there is nothing left to do ("Your day is clear", "All caught up"):
 * a green-tinted card with the glyph in a tile, a 16px title over the description, and an
 * action at the right.
 */
export const HomeNotice = forwardRef<HTMLDivElement, HomeNoticeProps>(function HomeNotice(
  { icon, title, description, action, className, ...props },
  ref,
) {
  return (
    <div ref={ref} role="status" className={cn(styles.notice, className)} {...props}>
      <span className={styles.tile} aria-hidden>
        {icon}
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
});
