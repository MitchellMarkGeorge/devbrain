import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './EmptyState.module.css';

export const emptyStateVariants = cva(styles.empty, {
  variants: {
    /** `page`: centred in the content area 160px from its top; `inline`: where it is put */
    placement: { page: styles.page, inline: undefined },
  },
  defaultVariants: { placement: 'page' },
});

export interface EmptyStateProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'title'>, VariantProps<typeof emptyStateVariants> {
  /** the page's entity icon, 20px in a 40px `secondary` tile: `CircleCheck` for tasks */
  icon: IconSource;
  /** "No tasks yet", "Trash is empty", "No tasks match these filters" */
  title: ReactNode;
  /** one line on what shows up here and how */
  description?: ReactNode;
  /** an `sm` default button: "New Task", "Clear Filters" */
  action?: ReactNode;
}

/**
 * An empty page or section: the icon in a 40px tile, the title (14px medium), a one-line
 * description and an optional small button, centred and 16px apart.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, placement, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(emptyStateVariants({ placement }), className)} {...props}>
      <span className={styles.tile} aria-hidden>
        {renderIcon(icon, 20)}
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action}
    </div>
  );
});
