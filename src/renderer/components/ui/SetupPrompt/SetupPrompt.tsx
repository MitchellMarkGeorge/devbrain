import { forwardRef, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './SetupPrompt.module.css';

export interface SetupPromptProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** a Lucide icon (drawn in a 32px `secondary` tile) or a ready tile, such as a provider's */
  icon?: IconSource;
  title?: ReactNode;
  description?: ReactNode;
  /**
   * The prompt's actions at the right: "Connect Google Calendar" and a ghost "Skip", "New Note".
   * A prompt without a title holds its content here alone (a `QuickAddInput`, "or", "Connect
   * Linear").
   */
  children?: ReactNode;
}

/**
 * A crisp call to action centred over a ghosted Home section on the first-run Home: a raised
 * popover-coloured card with an icon tile, a title over a one-line description, and its actions.
 */
export const SetupPrompt = forwardRef<HTMLDivElement, SetupPromptProps>(function SetupPrompt(
  { icon, title, description, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.prompt, className)} {...props}>
      {icon &&
        (isValidElement(icon) ? (
          icon
        ) : (
          <span className={styles.tile} aria-hidden>
            {renderIcon(icon, 16)}
          </span>
        ))}
      {(title || description) && (
        <span className={styles.text}>
          {title && <span className={styles.title}>{title}</span>}
          {description && <span className={styles.description}>{description}</span>}
        </span>
      )}
      {children && <span className={styles.actions}>{children}</span>}
    </div>
  );
});
