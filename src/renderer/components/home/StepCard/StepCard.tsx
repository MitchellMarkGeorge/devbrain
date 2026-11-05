import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { StatusIcon } from '../../entities/StatusIcon';
import styles from './StepCard.module.css';

export interface StepCardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** the step's number, in a 24px ring until done */
  step: number;
  title: ReactNode;
  /** one or two lines on what the step does */
  description?: ReactNode;
  /** the 96px preview: provider tiles, a `QuickAddInput`, a note's ghost; dimmed once done */
  preview?: ReactNode;
  /** the footer while the step is open: its button, or a hint ("↵ to add it") */
  footer?: ReactNode;
  done?: boolean;
  /** what was done, after "Done ·": "Google Calendar connected", "1 task added" */
  doneText?: ReactNode;
}

/**
 * One step of the guided start on the first-run Home: number, title, description, a preview of
 * what it makes, and a footer. Done, it shows the green check, a muted title and what was done.
 */
export const StepCard = forwardRef<HTMLDivElement, StepCardProps>(function StepCard(
  { step, title, description, preview, footer, done = false, doneText, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-done={done ? '' : undefined}
      className={cn(styles.card, className)}
      {...props}
    >
      {done ? (
        <span className={styles.marker}>
          <StatusIcon status="completed" size={20} />
        </span>
      ) : (
        <span className={cn(styles.marker, styles.number)} aria-label={`Step ${step}`}>
          {step}
        </span>
      )}
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {preview && <div className={styles.preview}>{preview}</div>}
      <div className={styles.footer}>
        {done ? (
          <>
            <span className={styles.doneLabel}>Done</span>
            {doneText && (
              <>
                <span aria-hidden>·</span>
                <span>{doneText}</span>
              </>
            )}
          </>
        ) : (
          footer
        )}
      </div>
    </div>
  );
});
