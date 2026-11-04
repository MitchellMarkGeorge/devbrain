import { forwardRef } from 'react';
import { Input as BaseInput } from '@base-ui/react/input';
import { mergeClassName } from '../../lib/cn';
import styles from './Input.module.css';

export interface InputProps extends BaseInput.Props {
  /** draws the destructive border; inside a `Field`, its `invalid` state does this */
  invalid?: boolean;
}

/**
 * shadcn's Input on Base UI. Put it in a `Field` for a label, description and error. Task and
 * note titles are not Inputs: they are plain text that edits in place.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      data-slot="input"
      aria-invalid={invalid || undefined}
      className={mergeClassName(styles.input, className)}
      {...props}
    />
  );
});
