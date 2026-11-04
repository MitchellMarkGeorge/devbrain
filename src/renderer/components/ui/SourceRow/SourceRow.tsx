import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './SourceRow.module.css';

export const sourceRowVariants = cva(styles.row, {
  variants: {
    /** the account or the source is off: the row fades to 50% */
    disabled: { true: styles.disabled },
    /** the status text's tone: `subtle` (default), `warning` (paused) or `error` (failing) */
    tone: { subtle: undefined, warning: styles.warning, error: styles.error },
  },
  defaultVariants: { tone: 'subtle' },
});

export interface SourceRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** what the source brings in: "Tasks", "Events" */
  title: ReactNode;
  /** "Issues assigned to you, with their projects", "2 of 5 calendars" */
  description?: ReactNode;
  /** a 16px icon before the title (a Lucide icon or a node) */
  icon?: IconSource;
  /** a button between the text and the status: "Choose calendars" */
  action?: ReactNode;
  /** "Synced 3 min ago", "Paused until you reconnect" */
  status?: ReactNode;
  tone?: 'subtle' | 'warning' | 'error';
  /** the source's Switch */
  control?: ReactNode;
  disabled?: boolean;
}

/**
 * One "Use this account for" source in an account card: icon and title over the description
 * (indented under the title), an optional button, the status text and the source's Switch.
 */
export const SourceRow = forwardRef<HTMLDivElement, SourceRowProps>(function SourceRow(
  { title, description, icon, action, status, tone, control, disabled, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(sourceRowVariants({ tone, disabled: disabled ?? false }), className)}
      aria-disabled={disabled || undefined}
      {...props}
    >
      <div className={styles.text}>
        <div className={styles.titleLine}>
          {icon != null && <span className={styles.icon}>{renderIcon(icon, 16)}</span>}
          <span className={styles.title}>{title}</span>
        </div>
        {description != null && <div className={styles.description}>{description}</div>}
      </div>
      {action}
      {status != null && <span className={styles.status}>{status}</span>}
      {control}
    </div>
  );
});
