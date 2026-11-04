import { forwardRef, type ReactNode } from 'react';
import { Field as BaseField } from '@base-ui/react/field';
import { mergeClassName } from '../../lib/cn';
import styles from './Field.module.css';

export interface FieldProps extends BaseField.Root.Props {
  /** shorthand for a `FieldLabel` above the control */
  label?: ReactNode;
  /** shorthand for a `FieldDescription` under the control */
  description?: ReactNode;
  /**
   * shorthand for a `FieldError` that always shows and marks the field invalid; say how to fix
   * the value ("Enter a name for the project.")
   */
  error?: ReactNode;
}

/**
 * A label over a control (`Input`, `Textarea`, `Checkbox`, `Switch`) with an optional description
 * and error, on Base UI's `Field`. Use the `label`/`description`/`error` shorthands, or compose
 * `FieldLabel`, `FieldDescription` and `FieldError` (with Base UI's validation) yourself.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { className, label, description, error, invalid, children, ...props },
  ref,
) {
  const hasError = error != null && error !== false;
  return (
    <BaseField.Root
      ref={ref}
      data-slot="field"
      invalid={invalid ?? (hasError || undefined)}
      className={mergeClassName(styles.field, className)}
      {...props}
    >
      {label != null && <FieldLabel>{label}</FieldLabel>}
      {children}
      {description != null && <FieldDescription>{description}</FieldDescription>}
      {hasError && <FieldError match>{error}</FieldError>}
    </BaseField.Root>
  );
});

export const FieldLabel = forwardRef<HTMLLabelElement, BaseField.Label.Props>(function FieldLabel(
  { className, ...props },
  ref,
) {
  return (
    <BaseField.Label
      ref={ref}
      data-slot="field-label"
      className={mergeClassName(styles.label, className)}
      {...props}
    />
  );
});

export const FieldDescription = forwardRef<HTMLParagraphElement, BaseField.Description.Props>(
  function FieldDescription({ className, ...props }, ref) {
    return (
      <BaseField.Description
        ref={ref}
        data-slot="field-description"
        className={mergeClassName(styles.description, className)}
        {...props}
      />
    );
  },
);

/** Shows when the field is invalid; `match` picks which validity error it is for. */
export const FieldError = forwardRef<HTMLDivElement, BaseField.Error.Props>(function FieldError(
  { className, ...props },
  ref,
) {
  return (
    <BaseField.Error
      ref={ref}
      data-slot="field-error"
      className={mergeClassName(styles.error, className)}
      {...props}
    />
  );
});
