import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Kbd } from '../Kbd';
import styles from './TipCard.module.css';

export interface TipCardProps extends ComponentPropsWithoutRef<'div'> {
  /** the shortcut: one chord ("⌘K"), or a sequence (["G", "T"]) read "G then T" */
  keys: string | string[];
  /** what it does: "Search everything" */
  children: ReactNode;
}

/** A shortcut tip for "Learn the basics" on the first-run Home: the keys, then what they do. */
export const TipCard = forwardRef<HTMLDivElement, TipCardProps>(function TipCard(
  { keys, children, className, ...props },
  ref,
) {
  const sequence = Array.isArray(keys) ? keys : [keys];
  return (
    <div ref={ref} className={cn(styles.tip, className)} {...props}>
      <span className={styles.keys}>
        {sequence.map((key, i) => (
          <span key={i} className={styles.keys}>
            {i > 0 && <span className={styles.then}>then</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </span>
      <span className={styles.label}>{children}</span>
    </div>
  );
});
