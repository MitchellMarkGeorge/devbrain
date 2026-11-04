import { forwardRef, type ReactNode } from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';
import { mergeClassName } from '../../lib/cn';
import { Icon } from '../Icon';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends BaseCheckbox.Root.Props {
  /** a visible label to the right; without one, give the box an `aria-label` */
  children?: ReactNode;
}

/**
 * shadcn's Checkbox on Base UI. In lists it selects rows for bulk actions; completing a task is
 * the `StatusIcon`, never this box.
 */
export const Checkbox = forwardRef<HTMLElement, CheckboxProps>(function Checkbox(
  { className, children, ...props },
  ref,
) {
  const box = (
    <BaseCheckbox.Root
      ref={ref}
      data-slot="checkbox"
      className={mergeClassName(styles.checkbox, className)}
      {...props}
    >
      <BaseCheckbox.Indicator
        className={styles.indicator}
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            <Icon icon={state.indeterminate ? Minus : Check} size={12} strokeWidth={3} />
          </span>
        )}
      />
    </BaseCheckbox.Root>
  );
  if (children == null) return box;
  return (
    <label className={styles.label}>
      {box}
      {children}
    </label>
  );
});
