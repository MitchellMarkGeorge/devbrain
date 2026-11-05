import { forwardRef, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../../ui/Icon';
import styles from './SetupRow.module.css';

export interface SetupRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * the 32px glyph: a `ProviderTile` for a provider, or a Lucide icon drawn in a `secondary` tile
   * for a step inside the app
   */
  icon: IconSource;
  /** the step: "Connect Google Calendar", "Start a project" */
  title: ReactNode;
  /** what the step adds to Home, one line */
  description: ReactNode;
  /** a default sm button: "Connect", "Create" */
  action: ReactNode;
}

/**
 * A setup step in Home's "Get started" section: a provider logo or an icon tile, the step and
 * what it adds to Home, and its button. Rows go once their step is done.
 */
export const SetupRow = forwardRef<HTMLDivElement, SetupRowProps>(function SetupRow(
  { icon, title, description, action, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.row, className)} {...props}>
      {isValidElement(icon) ? icon : <span className={styles.tile}>{renderIcon(icon, 16)}</span>}
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
      </div>
      <div className={styles.action}>{action}</div>
    </div>
  );
});
