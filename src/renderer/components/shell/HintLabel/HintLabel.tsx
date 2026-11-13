import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import styles from './HintLabel.module.css';

export interface HintLabelProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  /** the keys that pick its target, as typed (`as`); drawn in capitals */
  label: string;
  /** how many of its keys have been typed: those are drawn dimmed */
  typed?: number;
}

/**
 * Vim mode's hint label (Figma `HintLabel`, `7702:55409`): the keys that click the element it sits
 * on while `f` hints are showing. The keyboard layer's hint overlay places one over each target.
 */
export const HintLabel = forwardRef<HTMLSpanElement, HintLabelProps>(function HintLabel(
  { label, typed = 0, className, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(styles.label, className)} {...props}>
      {typed > 0 && <span className={styles.typed}>{label.slice(0, typed).toUpperCase()}</span>}
      {label.slice(typed).toUpperCase()}
    </span>
  );
});
