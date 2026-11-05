import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../../ui/Button';
import { StatusIcon } from '../../entities/StatusIcon';
import styles from './SetupBanner.module.css';

export interface SetupBannerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: ReactNode;
  /** what was done: "Calendar connected, first task added, first note written." */
  description?: ReactNode;
  /** Hide removes the banner for good */
  onHide?: () => void;
}

/**
 * What the guided start collapses to once every step is done: a 44px card with the completed
 * glyph, "You're set up", what was done, and Hide.
 */
export const SetupBanner = forwardRef<HTMLDivElement, SetupBannerProps>(function SetupBanner(
  { title = 'You’re set up', description, onHide, className, ...props },
  ref,
) {
  return (
    <div ref={ref} role="status" className={cn(styles.banner, className)} {...props}>
      <StatusIcon status="completed" />
      <span className={styles.title}>{title}</span>
      {description && (
        <>
          <span className={styles.dot} aria-hidden>
            ·
          </span>
          <span className={styles.description}>{description}</span>
        </>
      )}
      {onHide && (
        <Button variant="ghost" size="xs" className={styles.hide} onClick={onHide}>
          Hide
        </Button>
      )}
    </div>
  );
});
