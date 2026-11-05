import { forwardRef, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../../ui/Icon';
import styles from './QuickStartCard.module.css';

export interface QuickStartCardProps extends Omit<ComponentPropsWithoutRef<'button'>, 'title'> {
  /**
   * A Lucide icon, drawn in a 32px `secondary` tile, or ready 32px tiles (provider tiles, 6px
   * apart) for "Bring in your work"
   */
  icon: IconSource;
  title: ReactNode;
  description?: ReactNode;
}

/**
 * A "Quick start" card on the first-run Home: an icon tile, the action's name and a two-line
 * description. The whole card is the button: New task, New note, New project, Bring in your work.
 */
export const QuickStartCard = forwardRef<HTMLButtonElement, QuickStartCardProps>(
  function QuickStartCard({ icon, title, description, className, ...props }, ref) {
    return (
      <button ref={ref} type="button" className={cn(styles.card, className)} {...props}>
        <span className={styles.icons} aria-hidden>
          {isValidElement(icon) ? (
            icon
          ) : (
            <span className={styles.tile}>{renderIcon(icon, 16)}</span>
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {description && <span className={styles.description}>{description}</span>}
        </span>
      </button>
    );
  },
);

/** Several tiles side by side in a `QuickStartCard`'s icon slot. */
export function QuickStartTiles({ children }: { children: ReactNode }) {
  return <span className={styles.tiles}>{children}</span>;
}
